import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshPostgres, connectionString } from './pg-support.mjs';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';

export const polygon=(x1,y1,x2,y2)=>({type:'Polygon',coordinates:[[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]]]});
export const pickup=[35.19,31.9],dropoff=[35.26,32.22];
export const line={type:'LineString',coordinates:[pickup,dropoff]};
export async function fixture(label='eligibility',extraEnv={}) {
  const {schema,database:db}=await freshPostgres(label);
  const dir=await mkdtemp(join(tmpdir(),'fastship-wp05-'));
  // The WP05 fixtures book many searching orders through HTTP; the T21 per-customer cap is a product
  // policy for real customers, so fixtures raise it explicitly instead of tripping it.
  const storage={DB_PATH:join(dir,'legacy.sqlite'),WIND_DATABASE_URL:connectionString,WIND_POSTGRES_TEST_ONLY:'1',WIND_POSTGRES_TEST_SCHEMA:schema,WIND_SEARCHING_LIMIT:extraEnv.WIND_SEARCHING_LIMIT??'200',...extraEnv};
  const a=await startApiProcess(storage),b=await startApiProcess(storage),call=apiCaller(()=>a.base),other=apiCaller(()=>b.base);
  let phone=598700000;
  const account=async(role='customer',vehicle='car')=>{
    const number=`0${phone++}`,salt=randomBytes(16).toString('hex'),password=`${salt}:${scryptSync('Synthetic-WP05-password',salt,32).toString('hex')}`;
    await db.run('INSERT INTO users(phone,name,password,role,status,vehicle,created_at,approved_at) VALUES(?,?,?,?,?,?,?,?)',number,'Synthetic WP05',password,role,'active',role==='driver'?vehicle:null,Date.now(),Date.now());
    return await call('/auth/login',{body:{phone:number,password:'Synthetic-WP05-password'}});
  };
  const admin=await account('admin'),customer=await account(),d1=await account('driver'),d2=await account('driver');
  const now=Date.now(),until=now+86400000;
  const evidence={reason:'Synthetic operator inspection for isolated test only',evidenceRef:'synthetic:wp05:case'};
  const post=(path,body,expect=200)=>call('/admin/eligibility'+path,{token:admin.token,body:{...body,...evidence},expect});
  const common={state:'approved',services:['parcel','ride','freight'],vehicleClasses:['car'],requiredPermits:[],validFrom:now-1000,validUntil:until};
  const setupCoverage=async(permits=[])=>{
    const from=await post('/areas',{...common,key:'synthetic_from',geometry:polygon(35.19,31.89,35.21,31.91)});
    const to=await post('/areas',{...common,key:'synthetic_to',geometry:polygon(35.25,32.21,35.27,32.23)});
    const route=await post('/routes',{...common,key:'synthetic_forward',fromAreaId:from.id,toAreaId:to.id,corridor:polygon(35.18,31.88,35.28,32.24),requiredPermits:permits});
    await activatePolicy(); return {from,to,route};
  };
  const activatePolicy=async()=>{
    const p=await db.one('SELECT revision FROM eligibility_policy WHERE id=1'); return await post('',{expectedRevision:p.revision,activated:true});
  };
  const vehicleBody={plate:`SYNTHETIC-${label}`,class:'car',state:'approved',seats:4,usableGrams:10000,usableCm3:1000000,lengthMm:2000,widthMm:1000,heightMm:1000,maxPieces:200,equipment:['straps'],validUntil:until};
  const vehicle=await post('/vehicles',vehicleBody);
  const reviewDriver=async(driver=d1,state='approved',vehicleId=vehicle.id)=>{
    const previous=await db.one('SELECT revision FROM driver_eligibility WHERE driver_id=?',driver.user.id);
    return await post(`/drivers/${driver.user.id}`,{vehicleId,state,validUntil:until,expectedRevision:previous?.revision??0});
  };
  const check=async(kind,subject,extra={})=>post('/checks',{kind,...subject,outcome:'approved',validFrom:now-1000,validUntil:until,method:'manual_in_person',issuer:'Synthetic test registry',...extra});
  const enroll=async(driver=d1)=>{
    const d=await db.one('SELECT revision,vehicle_id FROM driver_eligibility WHERE driver_id=?',driver.user.id);
    return await call('/driver/eligibility/activate',{token:driver.token,body:{vehicleId:d.vehicle_id,expectedRevision:d.revision}});
  };
  const verify=async(driver=d1,vehicleId=vehicle.id)=>{
    await reviewDriver(driver,'approved',vehicleId); await check('driver_license',{driverId:driver.user.id});
    for(const kind of ['vehicle_registration','vehicle_inspection']) await check(kind,{vehicleId});
    await enroll(driver);
  };
  const book=async(extra={})=>call('/orders',{token:customer.token,body:{service:'parcel',pickupCity:'ramallah',dropoffCity:'nablus',option:'small',shared:false,contact:'0598700999',detail:'Synthetic sealed item',pickupNote:'Synthetic pickup',dropoffNote:'Synthetic dropoff',pickupPoint:{longitude:pickup[0],latitude:pickup[1]},dropoffPoint:{longitude:dropoff[0],latitude:dropoff[1]},...extra}});
  const approach=async(order,extra={},expect=200)=>{
    const req=await db.one('SELECT revision FROM order_requirements WHERE order_id=?',order.id);
    const v=await db.one('SELECT revision FROM vehicles WHERE id=?',extra.vehicleId??vehicle.id);
    const run=await db.one('SELECT revision FROM vehicle_runs WHERE vehicle_id=?',extra.vehicleId??vehicle.id);
    const last=await db.one(`SELECT o.dropoff_lng,o.dropoff_lat FROM capacity_reservations r JOIN orders o ON o.id=r.order_id
      WHERE r.vehicle_id=? AND o.status IN('assigned','at_pickup','in_transit','on_hold','returning') ORDER BY r.planned_end DESC,r.order_id DESC LIMIT 1`,extra.vehicleId??vehicle.id);
    const current=await db.one('SELECT pickup_lng,pickup_lat FROM orders WHERE id=?',order.id);
    return await post(`/orders/${order.id}`,{expectedRevision:req.revision,approach:{vehicleId:vehicle.id,expectedVehicleRevision:v.revision,expectedRunRevision:run.revision,
      from:{longitude:last?.dropoff_lng??35.18,latitude:last?.dropoff_lat??31.89},to:{longitude:current.pickup_lng,latitude:current.pickup_lat},seconds:30,
      observedAt:Date.now()-100,validUntil:Date.now()+3600000,method:'operator_attested',...extra}},expect);
  };
  const assess=async(order,extra={})=>{
    const {approach:withApproach=true,...assessment}=extra;
    const prior=await db.one('SELECT revision FROM order_requirements WHERE order_id=?',order.id);
    const result=await post(`/orders/${order.id}`,{expectedRevision:prior?.revision??0,items:[{count:1,gramsEach:6000,lengthMm:100,widthMm:100,heightMm:100}],seats:0,equipment:['straps'],rotationPolicy:'fixed_axes_no_stacking',route:line,routeSeconds:60,serviceSeconds:10,pickupAfter:now-1000,pickupBefore:until-10000,dropoffBefore:until-1000,...assessment});
    if (withApproach && (await db.one('SELECT status FROM orders WHERE id=?',order.id)).status==='searching') await approach(order);
    return result;
  };
  const close=async()=>{await Promise.all([a.stop(),b.stop()]);await db.close();};
  return {db,schema,a,b,call,other,admin,customer,d1,d2,account,now,until,evidence,post,common,setupCoverage,activatePolicy,vehicle,vehicleBody,reviewDriver,check,enroll,verify,book,assess,approach,close};
}

