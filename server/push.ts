// Web Push without a provider account (SPEC-web-push.md): VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291).
import { createECDH, createHmac, createCipheriv, randomBytes, sign, type KeyObject } from 'node:crypto';

export const b64url = (b: Buffer) => b.toString('base64url');
const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();

/** Encrypt one push message for a subscription (single record, RFC 8291 §3–4). Salt and sender key are injectable for the RFC test vector. */
export function encrypt(plaintext: Buffer, uaPublic: Buffer, authSecret: Buffer, test?: { asPrivate: Buffer; salt: Buffer }) {
  const ecdh = createECDH('prime256v1');
  if (test) ecdh.setPrivateKey(test.asPrivate); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const salt = test?.salt ?? randomBytes(16);
  const prkKey = hmac(authSecret, ecdh.computeSecret(uaPublic));
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

/** VAPID Authorization header for one push service origin, valid 12 hours. */
export function vapid(endpoint: string, publicRaw: Buffer, privateKey: KeyObject, subject: string) {
  const part = (o: object) => b64url(Buffer.from(JSON.stringify(o)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64url(signature)}, k=${b64url(publicRaw)}`;
}

// Only the browsers' own push services: the endpoint comes from the client, so anything else would be SSRF.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/];
export function pushEndpoint(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && url.href.length <= 1000 && PUSH_HOSTS.some(h => h.test(url.hostname)) ? url.href : null;
  } catch { return null; }
}
