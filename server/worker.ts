import { createPrivateKey, generateKeyPairSync, randomInt, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Persistence, type Row } from './db/persistence.ts';
import { runtimePersistence } from './db/runtime.ts';
import { encrypt, pushEndpoint, vapid } from './push.ts';
import { durableProtocolAvailable, subscriptionKey } from './domain/events.ts';
import { nativeSuppression, PUSH_KINDS } from './domain/native-push.ts';
import { Dispatch } from './domain/dispatch.ts';
import { Eligibility } from './domain/eligibility.ts';
import { logServerError } from './domain/diagnostics.ts';

type Work = Row & { event_id: string; destination: string; lease_owner: string; payload: Row };
type WorkerOptions = { leaseMs?: number; maxAttempts?: number; baseBackoffMs?: number;
  transport?: (subscription: Row, message: string, ttl: number) => Promise<void>;
  expoTransport?: (token: Row, message: string, ttl: number) => Promise<void>;
  afterPublish?: (work: Work) => Promise<void> };
/** Separate process; PostgreSQL leases, not API timers, own durable delivery. */
export const isDeviceNotRegistered = (error: unknown) => {
  const value = error as { code?: unknown; expoError?: unknown; message?: unknown };
  return value?.code === 'DeviceNotRegistered' || value?.expoError === 'DeviceNotRegistered'
    || (typeof value?.message === 'string' && value.message.includes('DeviceNotRegistered'));
};
export class DurableWorker {
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly baseBackoff: number;
  readonly db: Persistence;
  private readonly options: WorkerOptions;
  constructor(db: Persistence, options: WorkerOptions = {}) {
    this.db=db; this.options=options;
    if (db.backend !== 'postgres') throw new Error('Durable worker requires PostgreSQL; SQLite outbox is unavailable');
    this.leaseMs = options.leaseMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 8;
    this.baseBackoff = options.baseBackoffMs ?? 1_000;
    for (const bound of [this.leaseMs,this.maxAttempts,this.baseBackoff])
      if (!Number.isSafeInteger(bound) || bound < 1) throw new Error('Invalid worker bounds');
    if (this.maxAttempts > 20 || this.leaseMs > 300_000 || this.baseBackoff > 60_000) throw new Error('Worker bounds exceeded');
  }
  async claim(): Promise<Work | undefined> {
    return this.db.transaction(async () => {
      const now = Date.now();
      await this.db.run(`UPDATE outbox SET status='review',lease_owner=NULL,lease_until=NULL,last_error='attempts_exhausted'
        WHERE status IN ('pending','processing') AND attempts>=? AND (lease_until IS NULL OR lease_until<=?)`, this.maxAttempts, now);
      const row = await this.db.one(`SELECT o.* FROM outbox o JOIN domain_events e ON e.id=o.event_id WHERE o.status IN ('pending','processing') AND o.next_attempt_at<=?
        AND (o.lease_until IS NULL OR o.lease_until<=?) AND o.attempts<? ORDER BY o.next_attempt_at,e.occurred_at,e.sequence,o.event_id,o.destination
        LIMIT 1 FOR UPDATE OF o SKIP LOCKED`, now, now, this.maxAttempts);
      if (!row) return;
      const owner = randomUUID();
      await this.db.run(`UPDATE outbox SET status='processing',attempts=attempts+1,lease_owner=?::uuid,lease_until=?
        WHERE event_id=?::uuid AND destination=?`, owner, now+this.leaseMs, row.event_id, row.destination);
      const event = await this.db.one('SELECT * FROM domain_events WHERE id=?::uuid', row.event_id);
      return { ...event, ...row, event_id: row.event_id, destination: row.destination, payload: event!.payload, attempts: row.attempts+1, lease_owner: owner } as Work;
    }, { commandId: randomUUID() });
  }
  private async finish(work: Work, status: 'delivered' | 'obsolete', reason: string | null = null) {
    return this.db.transaction(async () => {
      const owned = await this.db.one(`SELECT * FROM outbox WHERE event_id=?::uuid AND destination=? AND lease_owner=?::uuid
        AND status='processing' AND lease_until>? FOR UPDATE`, work.event_id,work.destination,work.lease_owner,Date.now());
      if (!owned) return false;
      if (status === 'delivered') {
        const inserted = await this.db.run('INSERT INTO consumer_inbox(event_id,destination,received_at) VALUES(?::uuid,?,?) ON CONFLICT DO NOTHING', work.event_id,work.destination,Date.now());
        if (inserted.changes && work.destination === 'timeline' && work.order_id) {
          await this.db.run(`INSERT INTO event_projection(order_id,sequence,event_id) VALUES(?,?,?::uuid)
            ON CONFLICT(order_id) DO UPDATE SET sequence=excluded.sequence,event_id=excluded.event_id
            WHERE event_projection.sequence<excluded.sequence`,work.order_id,work.sequence,work.event_id);
        }
      }
      await this.db.run('UPDATE outbox SET status=?,lease_owner=NULL,lease_until=NULL,last_error=? WHERE event_id=?::uuid AND destination=?',status,reason,work.event_id,work.destination);
      return true;
    }, { commandId: work.event_id });
  }
  private async validate(work: Work, userId: number) {
    const user=await this.db.one("SELECT * FROM users WHERE id=? AND status='active'",userId);
    if (!user) return;
    const event=work.payload, kind=event.kind;
    if (!PUSH_KINDS.includes(kind)) throw new Error('invalid_notification');
    if (event.path?.startsWith('/admin') && user.role!=='admin') return;
    if (event.path?.startsWith('/driver') && user.role!=='driver') return;
    const ttl=kind==='job' ? 300 : kind==='offer' ? 600 : 3600;
    const remaining=Math.floor((work.occurred_at+ttl*1000-Date.now())/1000);
    if (remaining<=0) return;
    if (work.order_id) {
      const order=await this.db.one('SELECT * FROM orders WHERE id=?',work.order_id);
      if (!order || event.assignmentEpoch!==order.assignment_epoch) return;
      if (kind==='job' || kind==='offer') {
        if (order.status!=='searching' || (order.scheduled_for && (order.scheduled_for<=Date.now() || order.scheduled_for>Date.now()+30*60_000))) return;
        if (kind==='job' && user.role!=='driver') return;
      } else if (user.role!=='admin' && userId!==order.customer_id && userId!==order.driver_id) return;
      if (kind==='offer_accepted' && (order.status!=='assigned' || userId!==order.driver_id)) return;
      if (['assigned','at_pickup','in_transit','completed','returned','on_hold','returning','cancelled'].includes(kind) && order.status!==kind) return;
    }
    return { user, remaining };
  }
  private async expoTarget(work: Work) {
    const match = /^expon:(\d+):([a-f0-9]{16,64})$/.exec(work.destination);
    if (!match) throw new Error('invalid_destination');
    const userId=Number(match[1]);
    const valid=await this.validate(work,userId);
    if (!valid) return;
    const token=await this.db.one(`SELECT n.* FROM native_push_tokens n JOIN sessions s ON s.token_hash=n.auth_session_hash AND s.user_id=n.user_id
      WHERE n.user_id=? AND n.token_hash LIKE ? AND s.created_at>? ORDER BY n.created_at LIMIT 1`,userId,`${match[2]}%`,Date.now()-90*86_400_000);
    if (!token) return;
    if (!/^(?:ExponentPushToken|ExpoPushToken)\[/.test(String(token.expo_push_token))) return { token, remaining: valid.remaining, invalidToken: true };
    const suppressed=nativeSuppression(token.prefs_json,String(work.payload.kind),token.disabled_at);
    if (suppressed) return { token, remaining: valid.remaining, suppressed };
    return { token, remaining: valid.remaining };
  }
  private async subscription(work: Work) {
    const match = /^webpush:(\d+):([a-f0-9]{64})$/.exec(work.destination);
    if (!match) throw new Error('invalid_destination');
    const userId=Number(match[1]);
    // One authority check for both transports: validate() owns the kind and order guards.
    const valid=await this.validate(work,userId);
    if (!valid) return;
    const subscription=(await this.db.all('SELECT * FROM push_subscriptions WHERE user_id=?',userId))
      .find(s=>subscriptionKey(s.endpoint)===match[2]);
    return subscription ? { subscription, remaining: valid.remaining } : undefined;
  }
  /** WP10 offer expiry shares the acceptance version boundary; restart-safe and idempotent. */
  async processDispatchExpiries(): Promise<number> {
    const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
    return new Dispatch(this.db, new Eligibility(this.db, fail), fail).processExpiries();
  }
  async runOnce() {
    try { await this.processDispatchExpiries(); } catch (error) { logServerError('outbox_worker_failed', error); }
    const work=await this.claim(); if (!work) return false;
    try {
      if (await this.db.one('SELECT event_id FROM consumer_inbox WHERE event_id=?::uuid AND destination=?',work.event_id,work.destination)) {
        await this.finish(work,'delivered'); return true;
      }
      if (work.destination==='timeline') { await this.finish(work,'delivered'); return true; }
      const isExpo=work.destination.startsWith('expon:');
      const target=isExpo?await this.expoTarget(work):await this.subscription(work);
      if (isExpo && target && (target as { suppressed?: string }).suppressed) { await this.finish(work,'obsolete',`suppressed_${(target as { suppressed?: string }).suppressed}`); return true; }
      if (isExpo && target && (target as { invalidToken?: boolean }).invalidToken) { await this.db.run('DELETE FROM native_push_tokens WHERE token_hash=?',(target as { token: Row }).token.token_hash); await this.finish(work,'obsolete','invalid_token'); return true; }
      if (!target) { await this.finish(work,'obsolete','expired_or_revoked'); return true; }
      const p=work.payload;
      const message=JSON.stringify({ kind:p.kind,order:p.order,url:p.path ?? (p.kind==='job'?'/driver':`/order/${p.order}`),
        lang:(((target as { token?: Row }).token ?? (target as { subscription: Row }).subscription).lang as string),eventId:work.event_id });
      if (isExpo) {
        if (this.options.expoTransport) await this.options.expoTransport((target as { token: Row }).token,message,target.remaining);
        else await this.expoSend((target as { token: Row }).token,message,target.remaining);
      } else if (this.options.transport) await this.options.transport((target as unknown as { subscription: Row }).subscription,message,target.remaining);
      else {
        const invalid = await this.webPush((target as unknown as { subscription: Row }).subscription,message,target.remaining);
        if (invalid) { await this.finish(work,'obsolete',`provider_http_${invalid}`); return true; }
      }
      await this.options.afterPublish?.(work);
      await this.finish(work,'delivered');
    } catch (error) {
      if (work.destination.startsWith('expon:') && isDeviceNotRegistered(error)) {
        const gone=/^expon:(\d+):([a-f0-9]{16,64})$/.exec(work.destination);
        if (gone) await this.db.run('DELETE FROM native_push_tokens WHERE user_id=? AND token_hash LIKE ?',Number(gone[1]),`${gone[2]}%`);
        await this.finish(work,'obsolete','device_not_registered'); return true;
      }
      const status=(error as { providerStatus?: number }).providerStatus;
      const safe=Number.isInteger(status) && status! >= 100 && status! <= 599 ? `provider_http_${status}` : 'delivery_failed';
      const exhausted=work.attempts>=this.maxAttempts;
      const backoff=Math.min(3_600_000,this.baseBackoff*2**Math.min(work.attempts-1,16));
      await this.db.run(`UPDATE outbox SET status=?,next_attempt_at=?,lease_owner=NULL,lease_until=NULL,last_error=?
        WHERE event_id=?::uuid AND destination=? AND lease_owner=?::uuid AND status='processing'`,
        exhausted?'review':'pending',Date.now()+backoff+randomInt(Math.max(1,Math.floor(backoff/4))),safe,work.event_id,work.destination,work.lease_owner);
    }
    return true;
  }
  private async expoSend(token: Row,message: string,ttl: number) {
    // Real Expo delivery stays disabled until the owner configures EAS/FCM/APNs
    // credentials and explicitly enables it; without that gate the attempt is
    // retried with backoff and lands in the operator review queue, never delivered.
    if (process.env.WIND_EXPO_PUSH_ENABLED !== '1') throw Object.assign(new Error('expo_not_configured'),{providerStatus:503});
    const data=JSON.parse(message) as Row;
    const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10_000),
      headers:{Accept:'application/json','Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})},
      body:JSON.stringify([{to:String(token.expo_push_token),title:'Wind',body:data.lang === 'en' ? 'You have a new update. Open Wind to view it.' : 'لديك تحديث جديد. افتح ويند لعرضه.',sound:'default',ttl,data:{kind:data.kind,order:data.order,url:data.url,eventId:data.eventId}}])});
    const tickets=await response.json().catch(()=>null) as { data?: { status?: string; details?: { error?: string } }[] } | null;
    await response.body?.cancel().catch(()=>{});
    if (!response.ok) throw Object.assign(new Error('provider_failed'),{providerStatus:response.status});
    const ticket=Array.isArray(tickets?.data)?tickets!.data[0]:undefined;
    if (ticket?.status==='error') {
      if (ticket.details?.error==='DeviceNotRegistered') throw Object.assign(new Error('DeviceNotRegistered'),{code:'DeviceNotRegistered'});
      throw Object.assign(new Error('provider_failed'),{providerStatus:400});
    }
    if (ticket?.status!=='ok') throw Object.assign(new Error('provider_failed'),{providerStatus:502});
  }
  private async webPush(subscription: Row,message: string,ttl: number) {
    const endpoint=pushEndpoint(subscription.endpoint);
    if (!endpoint) throw new Error('invalid_endpoint');
    let keys=await this.db.one('SELECT private_jwk FROM push_keys WHERE id=1');
    if (!keys) {
      // Installed subscriptions need not have called /push/key on this database. Competing
      // workers must use the one persisted key, including the winner of an initialization race.
      const candidate=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'});
      await this.db.run('INSERT INTO push_keys(id,private_jwk) VALUES(1,?) ON CONFLICT DO NOTHING',JSON.stringify(candidate));
      keys=await this.db.one('SELECT private_jwk FROM push_keys WHERE id=1');
    }
    if (!keys) throw new Error('missing_push_keys');
    const jwk=JSON.parse(keys.private_jwk);
    const privateKey=createPrivateKey({key:jwk,format:'jwk'});
    const publicRaw=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]);
    const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10_000),
      body:encrypt(Buffer.from(message),Buffer.from(subscription.p256dh,'base64url'),Buffer.from(subscription.auth,'base64url')),
      headers:{TTL:String(ttl),Urgency:'high','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',
        Authorization:vapid(endpoint,publicRaw,privateKey,process.env.WIND_PUSH_SUBJECT ?? 'https://wind-production-72aa.up.railway.app')}});
    await response.body?.cancel();
    if (response.status===404 || response.status===410) {
      await this.db.run('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=? AND created_at=?',endpoint,subscription.user_id,subscription.created_at);
      return response.status; // Never record an invalid subscription as delivered.
    }
    if (!response.ok) throw Object.assign(new Error('provider_failed'),{providerStatus:response.status});
  }
  async run(signal: AbortSignal) {
    while (!signal.aborted) {
      try { if (await this.runOnce()) continue; }
      catch (error) { logServerError('outbox_worker_failed',error); }
      try { await delay(250,undefined,{signal}); } catch { break; }
    }
  }
}
if (import.meta.main) {
  // The same loopback/test cutover gate as the API; never silently start a production PG writer.
  if (!process.env.WIND_DATABASE_URL) throw new Error('Durable worker requires explicitly gated PostgreSQL');
  const db=runtimePersistence();
  const abort=new AbortController();
  process.once('SIGTERM',()=>abort.abort()); process.once('SIGINT',()=>abort.abort());
  try {
    if (!(await durableProtocolAvailable(db))) throw new Error('Durable worker requires migration 4');
    await new DurableWorker(db).run(abort.signal);
  } finally { await db.close(); }
}
