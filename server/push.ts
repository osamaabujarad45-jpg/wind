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

export const isDeviceNotRegistered = (error: unknown) => {
  const value = error as { code?: unknown; expoError?: unknown; message?: unknown };
  return value?.code === 'DeviceNotRegistered' || value?.expoError === 'DeviceNotRegistered'
    || (typeof value?.message === 'string' && value.message.includes('DeviceNotRegistered'));
};

/** What the lock screen says: the event only, never a name, address or price. Details stay in the app, which re-checks authority when opened. */
const pushWords: Record<string, { ar: string; en: string }> = {
  job: { ar: 'طلب توصيل جديد متاح. افتح ويند لقبوله.', en: 'New delivery job available. Open Wind to take it.' },
  offer: { ar: 'عرض سعر جديد. افتح ويند للرد.', en: 'A new price offer. Open Wind to respond.' },
  offer_accepted: { ar: 'قُبل عرضك. افتح ويند للتفاصيل.', en: 'Your offer was accepted. Open Wind for details.' },
  assigned: { ar: 'قبل سائق طلبك وهو في الطريق.', en: 'A driver took your order and is on the way.' },
  at_pickup: { ar: 'وصل السائق إلى نقطة الاستلام.', en: 'Your driver has reached the pickup.' },
  in_transit: { ar: 'طلبك في الطريق. جهّز رمز التسليم.', en: 'Your order is on its way. Have the handover code ready.' },
  completed: { ar: 'تم التوصيل. شكراً لاستخدامك ويند.', en: 'Delivered. Thank you for using Wind.' },
  released: { ar: 'نبحث عن سائق آخر لطلبك.', en: 'Looking for another driver for your order.' },
  cancelled: { ar: 'أُلغي الطلب. افتح ويند للتفاصيل.', en: 'The order was cancelled. Open Wind for details.' },
  message: { ar: 'رسالة جديدة بخصوص طلبك.', en: 'New message about your order.' },
  on_hold: { ar: 'طلبك متوقف مؤقتاً. افتح ويند للتفاصيل.', en: 'Your order is on hold. Open Wind for details.' },
  returning: { ar: 'يعود طلبك إلى المرسل. جهّز رمز الإرجاع.', en: 'Your order is coming back. Have the return code ready.' },
  returned: { ar: 'أُعيد الطلب إلى المرسل.', en: 'The order was returned to the sender.' },
  decided: { ar: 'صدر قرار بخصوص طلبك. افتح ويند.', en: 'A decision was made on your job. Open Wind.' },
  approved: { ar: 'تمت الموافقة على حسابك. يمكنك استلام الطلبات الآن.', en: 'Your account is approved. You can take jobs now.' },
  support: { ar: 'تحديث من الدعم بخصوص طلبك.', en: 'An update from support about your order.' },
  cash: { ar: 'تحديث في حساب النقد. افتح ويند للتفاصيل.', en: 'An update to your cash balance. Open Wind for details.' },
  safety: { ar: 'بلاغ أمان يحتاج إلى مراجعة فورية.', en: 'A safety report needs review now.' },
  destination_request: { ar: 'طلب الزبون تغيير الوجهة. افتح ويند للرد.', en: 'The customer asked to change the destination. Open Wind to respond.' },
  destination_accepted: { ar: 'قبل السائق تغيير الوجهة.', en: 'The driver accepted the new destination.' },
  destination_declined: { ar: 'لم يقبل السائق تغيير الوجهة.', en: 'The driver declined the new destination.' },
};
const pushBody = (kind: unknown, lang: unknown) => { const words = pushWords[String(kind)]; return lang === 'en' ? words?.en ?? 'You have a new update. Open Wind to view it.' : words?.ar ?? 'لديك تحديث جديد. افتح ويند لعرضه.'; };

/** One Expo push.
 * Real delivery waits for the owner's FCM/APNs credentials and WIND_EXPO_PUSH_ENABLED=1; until then this throws. */
export async function sendExpoPush(token: { expo_push_token?: unknown }, message: string, ttl: number, urgent: boolean) {
  if (process.env.WIND_EXPO_PUSH_ENABLED !== '1') throw Object.assign(new Error('expo_not_configured'), { providerStatus: 503 });
  const data = JSON.parse(message) as { kind: unknown; order: unknown; url: unknown; lang: unknown; eventId?: unknown };
  const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
    // channelId names the high-importance channel src/native-push.ts creates, so Android shows a heads-up; priority wakes a dozing phone.
    body: JSON.stringify([{ to: String(token.expo_push_token), title: 'Wind', body: pushBody(data.kind, data.lang),
      sound: 'default', ttl, priority: urgent ? 'high' : 'normal', channelId: 'default', data: { kind: data.kind, order: data.order, url: data.url, eventId: data.eventId } }]) });
  const tickets = await response.json().catch(() => null) as { data?: { status?: string; details?: { error?: string } }[] } | null;
  await response.body?.cancel().catch(() => {});
  if (!response.ok) throw Object.assign(new Error('provider_failed'), { providerStatus: response.status });
  const ticket = Array.isArray(tickets?.data) ? tickets!.data[0] : undefined;
  if (ticket?.status === 'error') {
    if (ticket.details?.error === 'DeviceNotRegistered') throw Object.assign(new Error('DeviceNotRegistered'), { code: 'DeviceNotRegistered' });
    throw Object.assign(new Error('provider_failed'), { providerStatus: 400 });
  }
  if (ticket?.status !== 'ok') throw Object.assign(new Error('provider_failed'), { providerStatus: 502 });
}

/** VAPID Authorization header for one push service origin, valid 12 hours. */
/** T37: the VAPID subject identifies the operator to push services. The obsolete Railway host default is
 * gone — set WIND_PUSH_SUBJECT (a mailto: address or https: origin you control) before web push can send. */
export function pushSubject(env: NodeJS.ProcessEnv = process.env): string {
  const subject = env.WIND_PUSH_SUBJECT?.trim();
  if (!subject) throw new Error('missing_push_subject');
  return subject;
}

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
