// T46: a backup copy that any machine can open with the owner's offline key. The DPAPI copy from backup-azure.ps1
// opens only inside the Windows account that made it; this one needs the private key file and its passphrase instead.
//   node scripts/backup-seal.mjs keygen <dir>          writes backup-public.pem and passphrase-protected backup-private.pem
//   node scripts/backup-seal.mjs seal <public.pem> <out> < plaintext
//   node scripts/backup-seal.mjs open <private.pem> <in> > plaintext
// The passphrase is read from WIND_BACKUP_PASSPHRASE (keygen and open) and never from the command line.
import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const oaep = { padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' };

export function seal(plaintext, publicKey) {
  const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({ v: 1, alg: 'RSA-OAEP-256+A256GCM', key: publicEncrypt({ key: publicKey, ...oaep }, key).toString('base64'),
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}

export function open(sealed, privateKey, passphrase) {
  const box = JSON.parse(sealed);
  if (box.v !== 1 || box.alg !== 'RSA-OAEP-256+A256GCM') throw new Error('Unknown sealed backup format');
  const key = privateDecrypt({ key: privateKey, passphrase, ...oaep }, Buffer.from(box.key, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]);
}

export function keygen(passphrase) {
  if (!passphrase || passphrase.length < 12) throw new Error('WIND_BACKUP_PASSPHRASE must be at least 12 characters');
  return generateKeyPairSync('rsa', { modulusLength: 4096, publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, first, second] = process.argv.slice(2);
  const passphrase = process.env.WIND_BACKUP_PASSPHRASE;
  if (command === 'keygen' && first) {
    const { publicKey, privateKey } = keygen(passphrase);
    writeFileSync(join(first, 'backup-public.pem'), publicKey, { flag: 'wx' });
    writeFileSync(join(first, 'backup-private.pem'), privateKey, { flag: 'wx', mode: 0o600 });
    console.log('Wrote backup-public.pem and backup-private.pem. Keep the private key and passphrase offline, apart from this computer.');
  } else if (command === 'seal' && first && second) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    writeFileSync(second, seal(Buffer.concat(chunks), readFileSync(first, 'utf8')), { flag: 'wx', mode: 0o600 });
  } else if (command === 'open' && first && second) {
    process.stdout.write(open(readFileSync(second, 'utf8'), readFileSync(first, 'utf8'), passphrase));
  } else {
    console.error('Usage: backup-seal.mjs keygen <dir> | seal <public.pem> <out> | open <private.pem> <in>');
    process.exit(2);
  }
}
