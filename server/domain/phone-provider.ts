export type SmsResult = { state: 'accepted'|'failed'|'unknown'|'obsolete'; attempted: boolean; httpStatus?: number };
export type PhoneConfig = { enabled: boolean; hmacKey?: Buffer; secretVersion: string; provider: 'ooredoo_communication';
  clientId: string; clientSecret: string; sender: string; countryCode: string; approvedPrefixes: string[];
  evidenceRef: string; dailyMessages: number; dailyBudgetMinor: number; maxCostMinor: number;
  baseUrl: string; tokenTimeoutMs: number; sendTimeoutMs: number };

export function phoneConfig(env: NodeJS.ProcessEnv = process.env): PhoneConfig {
  const testSettings=Object.keys(env).some(k=>/^WIND_(?:PHONE|OTP).*?(?:TEST|BYPASS)/.test(k) && env[k]!==undefined);
  if (env.NODE_ENV==='production' && (testSettings || (env.WIND_PHONE_PROVIDER && env.WIND_PHONE_PROVIDER!=='ooredoo_communication')))
    throw new Error('Production phone verification rejects test providers and OTP bypass settings');
  const testUrl=env.WIND_PHONE_TEST_PROVIDER_URL;
  if (testUrl) {
    const url=new URL(testUrl),db=env.WIND_DATABASE_URL ? new URL(env.WIND_DATABASE_URL) : null;
    if (env.NODE_ENV!=='test' || !/^wp0[34]_[a-z0-9_]{1,48}$/.test(env.WIND_POSTGRES_TEST_SCHEMA??'') || env.WIND_POSTGRES_TEST_ONLY!=='1'
      || !db || !['127.0.0.1','localhost','[::1]'].includes(db.hostname) || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)
      || url.protocol!=='http:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)
      throw new Error('Phone provider injection requires an isolated loopback PostgreSQL test schema');
  }
  const positive=(key:string,fallback=0)=>/^\d+$/.test(env[key]??'') && Number.isSafeInteger(Number(env[key])) && Number(env[key])>0 ? Number(env[key]) : fallback;
  const encoded=env.WIND_PHONE_HMAC_KEY??'',hmacKey=/^[A-Za-z0-9+/]{43,}={0,2}$/.test(encoded)?Buffer.from(encoded,'base64'):undefined;
  const config:PhoneConfig={enabled:false,hmacKey:hmacKey && hmacKey.length>=32?hmacKey:undefined,secretVersion:env.WIND_PHONE_HMAC_VERSION??'1',
    provider:'ooredoo_communication',clientId:env.WIND_OOREDOO_CLIENT_ID??'',clientSecret:env.WIND_OOREDOO_CLIENT_SECRET??'',
    sender:env.WIND_OOREDOO_SENDER??'',countryCode:env.WIND_OOREDOO_COUNTRY_CODE??'',
    approvedPrefixes:(env.WIND_PHONE_APPROVED_PREFIXES??'').split(',').filter(x=>['+97056','+97059','+97256','+97259'].includes(x)),
    evidenceRef:env.WIND_PHONE_PROVIDER_EVIDENCE??'',dailyMessages:positive('WIND_PHONE_DAILY_MESSAGE_LIMIT'),
    dailyBudgetMinor:positive('WIND_PHONE_DAILY_BUDGET_MINOR'),maxCostMinor:positive('WIND_PHONE_SMS_MAX_COST_MINOR'),
    baseUrl:testUrl?.replace(/\/$/,'')??'https://api.ooredoo.com',tokenTimeoutMs:3000,sendTimeoutMs:5000};
  config.enabled=env.WIND_PHONE_ENABLED==='1' && env.WIND_PHONE_PROVIDER==='ooredoo_communication' && !!config.hmacKey
    && /^[a-zA-Z0-9_.:-]{1,32}$/.test(config.secretVersion) && !!config.clientId && !!config.clientSecret && !/[\r\n]/.test(config.clientId+config.clientSecret)
    && /^[A-Za-z0-9 _.-]{1,32}$/.test(config.sender) && /^[A-Z0-9_]{2,16}$/.test(config.countryCode) && !!config.approvedPrefixes.length
    && /^[A-Za-z0-9_.:/-]{3,160}$/.test(config.evidenceRef) && config.dailyMessages>0 && config.dailyBudgetMinor>0 && config.maxCostMinor>0;
  return config;
}

async function boundedJson(response: Response) {
  if (!response.body || Number(response.headers.get('content-length')??0)>16384) throw new Error('Invalid provider response');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try { for (;;) { const next=await reader.read(); if (next.done) break; size+=next.value.length;
    if (size>16384) throw new Error('Invalid provider response'); chunks.push(next.value); } }
  finally { await reader.cancel().catch(()=>{}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>;
}

/** Published Ooredoo Communication Management v4 only: no undocumented receipts/callbacks/retries. */
export class OoredooCommunication {
  config: PhoneConfig;
  private cached?: {value:string;until:number};
  private refreshing?: Promise<string>;
  private transport:typeof fetch;
  constructor(config:PhoneConfig, transport?:typeof fetch) {
    const testDb=process.env.WIND_DATABASE_URL ? new URL(process.env.WIND_DATABASE_URL) : null;
    if (transport && (process.env.NODE_ENV!=='test' || !/^wp0[34]_[a-z0-9_]{1,48}$/.test(process.env.WIND_POSTGRES_TEST_SCHEMA??'')
      || process.env.WIND_POSTGRES_TEST_ONLY!=='1' || !testDb || !['127.0.0.1','localhost','[::1]'].includes(testDb.hostname)))
      throw new Error('Provider injection is test-only');
    this.config=config;this.transport=transport??fetch;
  }
  private async token() {
    if (this.cached && this.cached.until>Date.now()+5000) return this.cached.value;
    if (this.refreshing) return this.refreshing;
    this.refreshing=(async()=>{
      const response=await this.transport(this.config.baseUrl+'/tmf-api/oauth/v4/token',{method:'POST',redirect:'error',
        signal:AbortSignal.timeout(this.config.tokenTimeoutMs),headers:{client_id:this.config.clientId,client_secret:this.config.clientSecret,'Content-Type':'application/x-www-form-urlencoded'},
        body:'grant_type=client_credentials'});
      if (response.status!==200) { await response.body?.cancel(); throw new Error('Provider authorization unavailable'); }
      const body=await boundedJson(response);
      if (typeof body.access_token!=='string' || !body.access_token || body.access_token.length>8192 || /[\r\n]/.test(body.access_token)
        || body.token_type!=='Bearer' || !Number.isSafeInteger(body.expires_in) || (body.expires_in as number)<1 || (body.expires_in as number)>86400)
        throw new Error('Provider authorization unavailable');
      this.cached={value:body.access_token,until:Date.now()+(body.expires_in as number)*1000};return body.access_token;
    })();
    try {return await this.refreshing;}finally{this.refreshing=undefined;}
  }
  async send(phone:string,code:string,transactionId:string,authorize:()=>Promise<boolean>):Promise<SmsResult> {
    let attempted=false;
    try {
      for(let authAttempt=0;authAttempt<2;authAttempt++) {
        const token=await this.token();
        if (!await authorize()) return {state:'obsolete',attempted};
        attempted=true;
        let response:Response;
        try { response=await this.transport(this.config.baseUrl+'/tmf-api/communicationManagement/v4/communicationMessage',{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(this.config.sendTimeoutMs),
          headers:{Authorization:`Bearer ${token}`,countryCode:this.config.countryCode,transactionId,'Content-Type':'application/json;charset=utf-8'},
          body:JSON.stringify({content:`Fastship code: ${code}. Valid for 5 minutes. Do not share this code.`,messageType:'sms',receiver:[{phoneNumber:phone}],sender:{name:this.config.sender}})}); }
        catch {return {state:'unknown',attempted:true};}
        if (response.status===401 && authAttempt===0) {
          await response.body?.cancel();
          // Refresh only the token actually rejected; another concurrent refresh may already have won.
          if (this.cached?.value===token) this.cached=undefined;
          continue;
        }
        if (response.status===201) {
          try {const body=await boundedJson(response);if (body.messageType!=='sms' || typeof body.content!=='string') return {state:'unknown',attempted:true,httpStatus:201};}
          catch {return {state:'unknown',attempted:true,httpStatus:201};}
          return {state:'accepted',attempted:true,httpStatus:201};
        }
        const status=response.status;await response.body?.cancel();
        // A server failure may follow acceptance: retain the reservation and never replay it automatically.
        return {state:status>=500?'unknown':'failed',attempted:true,httpStatus:status};
      }
    } catch { return {state:attempted?'unknown':'failed',attempted}; }
    return {state:'failed',attempted};
  }
}
