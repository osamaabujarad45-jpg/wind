import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import Constants from 'expo-constants';
import { api, API_URL, configureApi, errorCode, invalidateApiSessionActions, storage } from './api';
import { apiSessionCredential, apiSessionRevision, serverOffset } from './api-client';
import { configureRecoveryActor, savedOfflineSummary } from './offline-recovery';
import { recoveryStorage } from './recovery-storage';
import type { OfflineSummary } from './offline-summary';
import { configureRuntime, resetRuntime } from './runtime-config';
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
  capabilities?: { enabledServices: Service[]; pooling: boolean; emailVerification?: boolean; declaredScope?: boolean } };

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
  refresh: () => Promise<void>;
};

const Context = createContext<Session | null>(null);
const phoneTest = phoneTestConfig(Constants.expoConfig?.extra?.phoneTest, API_URL);
// Measured from bundle load, so session-ready timing includes everything before the provider mounts.
const bundleStartedAt = Date.now();

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [offlineSummary, setOfflineSummary] = useState<OfflineSummary | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [language, setLanguageState] = useState<Language>(getLocales()[0]?.languageCode === 'en' ? 'en' : 'ar');
  const announced = useRef(false);
  useEffect(() => {
    if (ready && !announced.current) { announced.current = true; clientDiagnostics.record('session_ready', { durationMs: Math.min(120_000, Math.max(0, Date.now() - bundleStartedAt)) }); }
  }, [ready]);

  const forget = useCallback(async () => {
    const endedCredential = apiSessionCredential();
    invalidateApiSessionActions();
    configureRecoveryActor(null); resetRuntime(); setOfflineSummary(null);
    clientDiagnostics.clear();
    await recoveryStorage.clear().catch(() => {});
    void stopPresence().catch(() => {}); // invalidate local presence before clearing the account
    await stopBackgroundLocation().catch(() => {});
    void dropLocalPush(); // an ended session must not leave this browser alerting
    configureApi(null, () => {});
    setMe(null);
    setOffline(false);
    if (await storage.get('token') === endedCredential) await storage.set('token', null);
  }, []);

  const refresh = useCallback(async () => {
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
        configureApi(token, forget);
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
    } catch (error) {
      if (phoneTest || errorCode(error) === 'network') setOffline(true);
    }
  }, [forget]);

  useEffect(() => {
    (async () => {
      // A restored native task is not authorized until this launch revalidates the account and active order.
      await stopBackgroundLocation().catch(() => {});
      await validatePresenceContextOnLaunch().catch(() => {});
      const [token, saved, seen] = await Promise.all([storage.get('token'), storage.get('language'), storage.get('onboarded')]);
      if (saved === 'ar' || saved === 'en') setLanguageState(saved);
      // Anyone who ever signed in on this device has seen the app; only a fresh install gets the welcome slides.
      setOnboarded(!!phoneTest || seen === '1' || !!token);
      if (phoneTest || token) {
        // Refresh older native token accessibility while the app is open, before starting any tracker.
        if (token && Platform.OS !== 'web') await storage.set('token', token).catch(() => {});
        configureApi(token, forget);
        const savedSummary = !phoneTest ? await savedOfflineSummary().catch(() => null) : null;
        if (savedSummary?.orders.length) {
          setOfflineSummary(savedSummary); setOffline(true); setReady(true);
          void refresh();
        } else await refresh();
      }
      setReady(true);
    })();
  }, [forget, refresh]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const changed = (event: StorageEvent) => {
      if (event.key !== 'token' || event.newValue === apiSessionCredential()) return;
      invalidateApiSessionActions(); configureRecoveryActor(null); resetRuntime(); clientDiagnostics.clear();
      setMe(null); setOffline(false); setOfflineSummary(null);
      void stopBackgroundLocation().catch(() => {}); void stopPresence().catch(() => {});
      configureApi(event.newValue, forget);
      if (event.newValue) void refresh();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [forget, refresh]);

  // Web: tell the browser the page language, or Chrome offers to "translate from English". Not dir: rows are flipped in code.
  useEffect(() => { if (Platform.OS === 'web') document.documentElement.lang = language; }, [language]);

  // Approvals, plan activations and tariff changes happen on the server: pick them up on foreground and every minute.
  // Quiet on purpose: a network blip mid-form must not swap the app for the offline screen.
  const signedIn = !!me;
  useEffect(() => {
    if (!signedIn) return;
    const stopDiagnostics = startDiagnosticDelivery();
    // T37: a relaunch into an existing session re-authorizes this device's push destination against the
    // current session (registering is idempotent; failures keep the polling fallback).
    void registerNativePush(language);
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
    const timer = setInterval(quiet, 60_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') quiet(); });
    return () => { stopDiagnostics(); clearInterval(timer); sub.remove(); };
  }, [signedIn, language]);

  const value: Session = {
    ready, offline, offlineSummary, me, language, refresh, forget, onboarded,
    finishOnboarding: () => { setOnboarded(true); storage.set('onboarded', '1'); },
    setLanguage: next => { setLanguageState(next); storage.set('language', next); },
    signIn: async ({ token, ...data }) => {
      await recoveryStorage.clear().catch(() => {}); resetRuntime(); setOfflineSummary(null);
      clientDiagnostics.clear();
      void registerNativePush(language);
      configureApi(token, forget);
      await Promise.all([storage.set('token', token), storage.set('onboarded', '1')]);
      setOnboarded(true);
      setMe(data);
      configureRecoveryActor(data.user);
    },
    signOut: async () => {
      invalidateApiSessionActions();
      // Give the server a short opportunity to revoke, but never hold sign-out on a failed network.
      await Promise.race([stopPresence().catch(() => false), new Promise(resolve => setTimeout(resolve, 5000))]);
      await disablePush().catch(() => {}); // a shared browser stops alerting this account
      await unregisterNativePush().catch(() => {});
      await api('/auth/logout', {}).catch(() => {});
      await forget();
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error('SessionProvider is missing');
  return session;
}
