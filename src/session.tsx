import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getLocales } from 'expo-localization';
import { api, configureApi, errorCode, storage } from './api';
import type { Plan, Settings, Subscription, User } from './model';

export type Language = 'ar' | 'en';
export type Me = { user: User; plan: Plan | null; subscription: Subscription | null; settings: Settings };

type Session = {
  ready: boolean;
  offline: boolean;
  me: Me | null;
  language: Language;
  setLanguage: (language: Language) => void;
  signIn: (data: Me & { token: string }) => Promise<void>;
  signOut: () => Promise<void>;
  forget: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [language, setLanguageState] = useState<Language>(getLocales()[0]?.languageCode === 'en' ? 'en' : 'ar');

  const forget = useCallback(async () => {
    configureApi(null, () => {});
    setMe(null);
    setOffline(false);
    await storage.set('token', null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'));
      setOffline(false);
    } catch (error) {
      if (errorCode(error) === 'network') setOffline(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [token, saved] = await Promise.all([storage.get('token'), storage.get('language')]);
      if (saved === 'ar' || saved === 'en') setLanguageState(saved);
      if (token) {
        configureApi(token, forget);
        await refresh();
      }
      setReady(true);
    })();
  }, [forget, refresh]);

  // Approvals, plan activations and tariff changes happen on the server: pick them up on foreground and every minute.
  // Quiet on purpose: a network blip mid-form must not swap the app for the offline screen.
  const signedIn = !!me;
  useEffect(() => {
    if (!signedIn) return;
    // Updater form: a reply landing after sign-out must not bring the session back.
    const quiet = () => { api<Me>('/me').then(data => setMe(current => current && data), () => {}); };
    const timer = setInterval(quiet, 60_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') quiet(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [signedIn]);

  const value: Session = {
    ready, offline, me, language, refresh, forget,
    setLanguage: next => { setLanguageState(next); storage.set('language', next); },
    signIn: async ({ token, ...data }) => {
      configureApi(token, forget);
      await storage.set('token', token);
      setMe(data);
    },
    signOut: async () => {
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
