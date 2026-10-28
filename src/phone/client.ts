// App bindings for the pure phone helpers: secure random UUIDs (expo-crypto, documented for SDK 57), SHA-256 for the session
// scope, the shared API client and secure storage. Nothing here logs or persists a code, password or provider detail.
import * as Crypto from 'expo-crypto';
import { api, storage } from '../api';
import { phoneRequests, type Call } from './requests';

/** Cryptographically secure RFC 4122 v4 UUID. Never Math.random: these scope the server's command replay and device rate limits. */
export const newUuid = (): string => Crypto.randomUUID();

export const digest = (value: string): Promise<string> => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

export const phoneApi = phoneRequests(<T,>(path: string, body?: object) => api<T>(path, body));

export const keyValue = storage;

export type { Call };
