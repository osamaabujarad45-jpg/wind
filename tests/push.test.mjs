// Web Push crypto (SPEC-web-push.md): RFC 8291 Appendix A vector, VAPID signature, endpoint allowlist.
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { encrypt, pushEndpoint, vapid } from '../server/push.ts';

const b = s => Buffer.from(s.replace(/\s/g, ''), 'base64url');
const body = encrypt(b('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
  b('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'), b('BTBZMqHH6r4Tts7J_aSIgg'),
  { asPrivate: b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), salt: b('DGv6ra1nlYgDCS1FRnbzlw') });
assert.deepEqual(body, Buffer.concat([b('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
  b('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ')]));

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const raw = publicKey.export({ format: 'jwk' });
const publicRaw = Buffer.concat([Buffer.from([4]), b(raw.x), b(raw.y)]);
const header = vapid('https://fcm.googleapis.com/fcm/send/abc', publicRaw, privateKey, 'https://example.org');
const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
const [h, c, s] = jwt.split('.');
assert.equal(JSON.parse(b(c).toString()).aud, 'https://fcm.googleapis.com');
assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, b(s)));
assert.equal(k, publicRaw.toString('base64url'));

assert.equal(pushEndpoint('https://fcm.googleapis.com/fcm/send/x'), 'https://fcm.googleapis.com/fcm/send/x');
assert.ok(pushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x'));
for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://fcm.googleapis.com:8443/x', 'https://169.254.169.254/', null])
  assert.equal(pushEndpoint(bad), null);
console.log('push crypto: ok');
