// Amazon SES v2 SendEmail over fetch, signed with AWS Signature Version 4 from node:crypto. One JSON POST does not
// justify the SDK's dependency tree (docs/implementation/dependency-security.md keeps the API runtime closure small).
import { createHash, createHmac } from 'node:crypto';

export type SesConfig = { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string; endpoint: string };
export type Mail = { from: string; to: string; subject: string; text: string; html: string };

/** Null until a Region and both key halves exist.
 * ponytail: environment keys only; read the instance role (IMDS) if the API ever runs on EC2/Lightsail. */
export function sesConfig(env: NodeJS.ProcessEnv): SesConfig | null {
  const region = env.AWS_REGION?.trim(), accessKeyId = env.AWS_ACCESS_KEY_ID?.trim(), secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!region || !/^[a-z]{2}(-[a-z]+)+-\d+$/.test(region) || !accessKeyId || !secretAccessKey) return null;
  return { region, accessKeyId, secretAccessKey, sessionToken: env.AWS_SESSION_TOKEN?.trim() || undefined,
    endpoint: (env.WIND_SES_ENDPOINT?.trim() || `https://email.${region}.amazonaws.com`).replace(/\/$/, '') };
}

const sha256 = (data: string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** SigV4 headers for a JSON POST without a query string, the only request shape this module makes. */
export function signedHeaders(c: Omit<SesConfig, 'endpoint'>, url: URL, body: string, service: string, now = new Date()) {
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, ''), day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-amz-date': amzDate,
    ...(c.sessionToken && { 'x-amz-security-token': c.sessionToken }) };
  const signed: Record<string, string> = { ...headers, host: url.host }; // fetch sends Host from the URL itself
  const names = Object.keys(signed).sort();
  const canonical = ['POST', url.pathname, '', ...names.map(name => `${name}:${signed[name]}`), '', names.join(';'), sha256(body)].join('\n');
  const scope = `${day}/${c.region}/${service}/aws4_request`;
  const key = [day, c.region, service, 'aws4_request'].reduce<string | Buffer>((k, part) => hmac(k, part), `AWS4${c.secretAccessKey}`);
  const signature = hmac(key, ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')).toString('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

/** One message to one recipient; 200 means SES accepted it. Bounces arrive later, never in this response. */
export function sesSend(c: SesConfig, mail: Mail, timeoutMs = 10_000) {
  const url = new URL(`${c.endpoint}/v2/email/outbound-emails`);
  const data = (Data: string) => ({ Data, Charset: 'UTF-8' });
  const body = JSON.stringify({ FromEmailAddress: mail.from, Destination: { ToAddresses: [mail.to] },
    Content: { Simple: { Subject: data(mail.subject), Body: { Text: data(mail.text), Html: data(mail.html) } } } });
  return fetch(url, { method: 'POST', body, headers: signedHeaders(c, url, body, 'ses'), signal: AbortSignal.timeout(timeoutMs) });
}
