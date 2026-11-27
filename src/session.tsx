import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import Constants from 'expo-constants';
import { api, API_URL, ApiError, configureApi, errorCode, invalidateApiSessionActions, storage } from './api';
import { apiSessionCredential, apiSessionRevision, serverOffset } from './api-client';
import { configureRecoveryActor, savedOfflineSummary } from './offline-recovery';
import { acknowledgeRecoveryWake, pendingRecoveryWake, recoveryStorage } from './recovery-storage';
import { outboxKey } from './chat-outbox';
import { deadlineWake } from './deadline-wake';
import { createDeadlineReconciler } from './deadline-recovery';
import { copy } from './copy';
import { setAuthNotice, takeAuthNotice } from './phone/notice';
import type { OfflineSummary } from './offline-summary';
import { retryMapProviders } from './map-failures';
import { configureRuntime, effectiveRuntime, resetRuntime } from './runtime-config';
import { clientDiagnostics } from './client-diagnostics';
import { startDiagnosticDelivery } from './diagnostic-client';
import { phoneTestConfig } from './phone-test';
import { disablePush, dropLocalPush } from './push';
import { registerNativePush, unregisterNativePush } from './native-push';
import { stopBackgroundLocation } from './background-location';
import { stopPresence, validatePresenceContextOnLaunch } from './driver-presence-runtime';
import type { Plan, Service, Settings, Subscription, User } from './model';

export type Language = 'ar' | 'en';
export type Me = { user: User; plan: Plan | null; subscription: Subscription | null; settings: Settings;
  rideOfferSeconds?: 20 | 30 | 40;
  capabilities?: { enabledServices: Service[]; pooling: boolean; emailVerification?: boolean; emailVerificationLink?: boolean; emailResetLinkProof?: boolean;
    offerRecoveryEmail?: boolean; declaredScope?: boolean; driverPresence?: boolean } };

type Session = {
  ready: boolean;
  offline: boolean;
  offlineSummary: OfflineSummary | null;
  me: Me | null;
  onboarded: boolean;
  finishOnboarding: () => void;
  language: Language;
  setLanguage: (language: Language) => void;
  signIn: (data: Me & { token: string }) => Promise<void>;
  signOut: () => Promise<void>;
  forget: () => Promise<void>;
  refresh: (reportFailure?: boolean) => Promise<void>;
};

const Context = createContext<Session | null>(null);
const phoneTest = phoneTestConfig(Constants.expoConfig?.extra?.phoneTest, API_URL);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const accountLoaded = useRef(false);
  const [offlineSummary, setOfflineSummary] = useState<OfflineSummary | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const signedInUser = useRef<number | null>(null);
  useEffect(() => { if (me) signedInUser.current = me.user.id; }, [me]);
  const [onboarded, setOnboarded] = useState(false);
  const [language, setLanguageState] = useState<Language>(getLocales()[0]?.languageCode === 'en' ? 'en' : 'ar');
  useEffect(() => {
    if (!offlineSummary) return;
    const now = Date.now() + serverOffset();
    const timer = setTimeout(() => setOfflineSummary(null), Math.max(0, offlineSummary.savedAt + effectiveRuntime(now).values.offlineMaxAgeMs - now));
    return () => clearTimeout(timer);
  }, [offlineSummary]);
  const startedAt = useRef<number | null>(null), announced = useRef(false);
  useEffect(() => { startedAt.current ??= Date.now(); }, []);
  useEffect(() => {
    if (ready && !announced.current && startedAt.current !== null) { announced.current = true; clientDiagnostics.record('session_ready', { durationMs: Math.min(120_000, Math.max(0, Date.now() - startedAt.current)) }); }
  }, [ready]);

  const endLocally = useCallback(() => {
    configureRecoveryActor(null); resetRuntime(); retryMapProviders(); setOfflineSummary(null);
    clientDiagnostics.clear();
    void dropLocalPush(); // an ended session must not leave this browser alerting
    configureApi(null, () => {});
    accountLoaded.current = false;
    setMe(null);
    setOffline(false);
  }, []);

  const forget = useCallback(async (revoke = false) => {
    const endedCredential = apiSessionCredential();
    invalidateApiSessionActions();
    const revision = apiSessionRevision();
    const current = () => revision === apiSessionRevision() && endedCredential === apiSessionCredential();
    void stopPresence().catch(() => {}); // invalidate local presence before clearing the account
    await stopBackgroundLocation().catch(() => {});
    if (!current()) return;
    const removed = await storage.exclusive(async () => {
      let stored = await storage.get('token', true);
      if (!current() || (stored !== null && stored !== endedCredential)) return false;
      if (stored === null) return true;
      await storage.set('token', null, true);
      if (!current()) return false;
      stored = await storage.get('token', true);
      return current() && stored === null;
    }).catch(() => { throw new ApiError('session_remove_failed'); });
    if (!removed) return;
    // Only now: until the token is gone this session is still open, and a failed sign-out must leave its records readable.
    if (endedCredential) await recoveryStorage.clear(endedCredential).catch(() => {});
    // Choosing to sign out also removes this account's unsent chat texts from the device (a forced sign-out keeps them).
    if (revoke && signedInUser.current) await storage.set(outboxKey(signedInUser.current), null).catch(() => {});
    if (!current()) return;
    if (revoke && endedCredential) void api('/auth/logout', {}).catch(() => {});
    endLocally();
  }, [endLocally]);

  // The server already ended this session (a 401, a deleted account, a changed phone). Storage refusing to delete the token
  // must not leave a dead session on screen; it stays harmless on disk, and the next launch gets a 401 and tries again.
  const ended = useCallback(async () => {
    const dead = apiSessionCredential();
    await forget().catch(() => { if (dead === apiSessionCredential()) endLocally(); });
  }, [forget, endLocally]);
  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);
  // The 401 carries no reason (it must not tell a stolen token whose account it was); sign-in does, once the password is right.
  const expired = useCallback(() => { setAuthNotice(copy[languageRef.current].sessionEndedNotice); void ended(); }, [ended]);

  const refresh = useCallback(async (reportFailure = false) => {
    const revision = apiSessionRevision();
    try {
      // Test icons obtain real, role-scoped sessions through the regular login API.
      // A cold launch also recovers after testing logout or password/session revocation.
      let data: Me;
      if (phoneTest) {
        const { token, ...account } = await api<Me & { token: string }>('/auth/login', {
          identifier: phoneTest.identifier, password: phoneTest.password,
        });
        if (account.user.role !== phoneTest.role) throw new Error('Phone test role mismatch');
        configureApi(token, expired);
        await storage.set('token', token);
        data = account;
      } else data = await api<Me>('/me');
      if (!phoneTest && revision !== apiSessionRevision()) return;
      configureRecoveryActor(data.user);
      setMe(data);
      setOffline(false);
      setOfflineSummary(null);
      const configRevision = apiSessionRevision();
      void api<unknown>('/runtime/configuration').then(config => {
        if (configRevision === apiSessionRevision()) configureRuntime(config, Date.now() + serverOffset());
      }).catch(() => {});
      accountLoaded.current = true;
    } catch (error) {
      if (!phoneTest && revision !== apiSessionRevision()) return;
      // A failed refresh under a working screen is a blip the screen's own polling rides out: only a launch that could
      // not reach the account has nothing to show. That screen keeps trying by itself, below.
      if (!accountLoaded.current && (phoneTest || errorCode(error) === 'network' || (error instanceof ApiError && (error.status ?? 0) >= 500))) setOffline(true);
      if (reportFailure === true) throw error;
    }
  }, [expired]);
  useEffect(() => {
    if (!offline) return;
    const timer = setInterval(() => { void refresh(); }, 6_000);
    return () => clearInterval(timer);
  }, [offline, refresh]);

  useEffect(() => {
    (async () => {
      // A restored native task is not authorized until this launch revalidates the account and active order.
      await stopBackgroundLocation().catch(() => {});
      await validatePresenceContextOnLaunch().catch(() => {});
      const [token, saved, seen] = await Promise.all([
        storage.get('token').catch(() => null), storage.get('language').catch(() => null), storage.get('onboarded').catch(() => null),
      ]);
      if (saved === 'ar' || saved === 'en') setLanguageState(saved);
      // No session on this device: no recovery record can exist, so no native deadline may outlive it (A14).
      if (!token && !phoneTest) await deadlineWake.clear().catch(() => {});
      // Anyone who ever signed in on this device has seen the app; only a fresh install gets the welcome slides.
      setOnboarded(!!phoneTest || seen === '1' || !!token);
      if (phoneTest || token) {
        // Refresh older native token accessibility while the app is open, before starting any tracker.
        if (token && Platform.OS !== 'web') await storage.set('token', token).catch(() => {});
        configureApi(token, expired);
        // The saved read-only summary appears only if the account cannot be reached (refresh clears it on success),
        // so an online launch never flashes the offline screen.
        if (!phoneTest) setOfflineSummary(await savedOfflineSummary().catch(error => { console.warn(`wind.offline-summary.read: ${(error as Error)?.message ?? 'unknown'} / ${((error as Error)?.cause as Error)?.name ?? 'no cause'}`); return null; }));
        await refresh();
      }
      setReady(true);
    })();
  }, [expired, refresh]);

  // A14: an Android alarm, reboot, unlock, clock or timezone change only asks this foreground session to re-read the
  // account and drop the saved summary. It never replays a command, sends a write or revives an assignment.
  useEffect(() => {
    if (!ready || phoneTest) return; // phone-test refresh signs in again; those builds keep plain foreground recovery
    const reconcile = createDeadlineReconciler({
      revision: apiSessionRevision, active: () => AppState.currentState === 'active' && !!apiSessionCredential(),
      read: pendingRecoveryWake, acknowledge: acknowledgeRecoveryWake,
      // Success clears the saved summary and re-reads the account; a failure throws, so the wake stays pending.
      reconcile: () => refresh(true),
    });
    const check = () => { void reconcile().catch(() => {}); };
    check();
    const wake = deadlineWake.subscribe(check);
    const active = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => { wake?.remove(); active.remove(); };
  }, [ready, refresh]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const changed = (event: StorageEvent) => {
      if (event.key !== 'token' || event.newValue === apiSessionCredential()) return;
      invalidateApiSessionActions(); configureRecoveryActor(null); resetRuntime(); retryMapProviders(); clientDiagnostics.clear();
      accountLoaded.current = false;
      setMe(null); setOffline(false); setOfflineSummary(null);
      void stopBackgroundLocation().catch(() => {}); void stopPresence().catch(() => {});
      configureApi(event.newValue, expired);
      if (event.newValue) void refresh();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [expired, refresh]);

  // Web: tell the browser the page language, or Chrome offers to "translate from English". Not dir: rows are flipped in code.
  useEffect(() => { if (Platform.OS === 'web') document.documentElement.lang = language; }, [language]);

  // Approvals, plan activations and tariff changes happen on the server: pick them up on foreground and every minute.
  // Quiet on purpose: a network blip mid-form must not swap the app for the offline screen.
  const signedIn = !!me;
  // Captains and staff are asked at once: job alerts are their work. Customers are asked after an order, merchants in merchant mode.
  const askAtSignIn = !!me && me.user.role !== 'customer';
  useEffect(() => {
    if (!signedIn) return;
    const stopDiagnostics = startDiagnosticDelivery();
    // T37: a relaunch into an existing session re-authorizes this device's push destination against the
    // current session (registering is idempotent; failures keep the polling fallback).
    void registerNativePush(language, askAtSignIn ? 'always' : false);
    // A server that turns push delivery on or off reaches a running phone within 10 minutes or at its next foreground.
    let pushCheckedAt = Date.now();
    // Updater form: a reply landing after sign-out must not bring the session back.
    const quiet = () => {
      const revision = apiSessionRevision();
      api<Me>('/me').then(data => {
        if (revision !== apiSessionRevision()) return;
        configureRecoveryActor(data.user);
        setMe(current => current?.user.id === data.user.id ? data : current);
      }, () => {});
      void api<unknown>('/runtime/configuration').then(config => {
        if (revision === apiSessionRevision()) configureRuntime(config, Date.now() + serverOffset());
      }).catch(() => {});
    };
    quiet();
    const timer = setInterval(() => {
      quiet();
      if (Date.now() - pushCheckedAt >= 10 * 60_000) { pushCheckedAt = Date.now(); void registerNativePush(language, false); }
    }, 60_000);
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      quiet();
      pushCheckedAt = Date.now();
      void registerNativePush(language, false);
    });
    return () => { stopDiagnostics(); clearInterval(timer); sub.remove(); };
  }, [signedIn, language, askAtSignIn]);

  const value: Session = {
    ready, offline, offlineSummary, me, language, refresh, forget: ended, onboarded,
    finishOnboarding: () => { setOnboarded(true); void storage.set('onboarded', '1').catch(() => {}); },
    setLanguage: next => { setLanguageState(next); void storage.set('language', next).catch(() => {}); },
    signIn: async ({ token, ...data }) => {
      try { await storage.exclusive(() => storage.set('token', token, true)); } catch { throw new ApiError('session_save_failed'); }
      // Old recovery records remain encrypted under the old credential if sign-in replaces it.
      resetRuntime(); retryMapProviders(); setOfflineSummary(null);
      clientDiagnostics.clear();
      configureApi(token, expired);
      void storage.set('onboarded', '1').catch(() => {});
      setOnboarded(true);
      setMe(data);
      configureRecoveryActor(data.user);
      accountLoaded.current = true;
      setOffline(false);
      void registerNativePush(language, data.user.role !== 'customer' ? 'always' : false);
    },
    signOut: async () => {
      takeAuthNotice(); // a normal sign-out never shows a leftover session-ended message
      const endedCredential = apiSessionCredential();
      invalidateApiSessionActions();
      const revision = apiSessionRevision();
      const current = async () => {
        if (revision !== apiSessionRevision() || endedCredential !== apiSessionCredential()) return false;
        let stored: string | null;
        try { stored = await storage.get('token', true); } catch { throw new ApiError('session_remove_failed'); }
        return revision === apiSessionRevision() && endedCredential === apiSessionCredential() && stored === endedCredential;
      };
      if (!await current()) return;
      // Give the server a short opportunity to revoke, but never hold sign-out on a failed network.
      await Promise.race([stopPresence().catch(() => false), new Promise(resolve => setTimeout(resolve, 5000))]);
      if (!await current()) return;
      await disablePush().catch(() => {}); // a shared browser stops alerting this account
      if (!await current()) return;
      await unregisterNativePush().catch(() => {});
      if (!await current()) return;
      await forget(true);
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error('SessionProvider is missing');
  return session;
}
