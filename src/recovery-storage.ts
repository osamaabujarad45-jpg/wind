import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { storage } from './storage';
import { apiSessionCredential, apiSessionRevision, serverOffset } from './api-client';
import { createProtectedRecovery, type RecoverySlot } from './protected-recovery';

// Derive separate AES keys from the high-entropy bearer credential, never a user's password or PIN.
// Browser ciphertext remains within the origin's trust boundary; native storage additionally uses SecureStore.
const encryptionKey = async (token: string, slot: RecoverySlot) => AESEncryptionKey.import(
  await digestStringAsync(CryptoDigestAlgorithm.SHA256, `wind-recovery-aes-v1:${slot}:${token}`), 'hex');
const base64 = (text: string) => btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16))));
const fromBase64 = (text: string) => decodeURIComponent(Array.from(atob(text), ch => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));

export const recoveryStorage = createProtectedRecovery({
  read: key => storage.get(key, true), write: (key, value) => storage.set(key, value, true),
  credential: async () => apiSessionCredential(), currentCredential: async token => await storage.get('token', true) === token,
  namespace: token => digestStringAsync(CryptoDigestAlgorithm.SHA256, `wind-recovery-slot-v1:${token}`),
  revision: apiSessionRevision, now: () => Date.now() + serverOffset(),
  seal: async (plaintext, token, slot) => {
    const sealed = await aesEncryptAsync(base64(plaintext), await encryptionKey(token, slot));
    return sealed.combined('base64');
  },
  open: async (ciphertext, token, slot) => fromBase64(await aesDecryptAsync(AESSealedData.fromCombined(ciphertext), await encryptionKey(token, slot), { output: 'base64' })),
});
