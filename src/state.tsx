import React, { createContext, useContext, useState } from 'react';
import type { Booking } from './model';
import { nextStatus } from './model';

type Language = 'ar' | 'en';
type Store = {
  language: Language;
  setLanguage: (language: Language) => void;
  gpsPoint: { latitude: number; longitude: number } | null;
  setGpsPoint: (point: { latitude: number; longitude: number } | null) => void;
  booking: Booking | null;
  placeBooking: (booking: Booking) => void;
  advanceDemo: () => void;
};

const Context = createContext<Store | null>(null);

export function DarbnaProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('ar');
  const [gpsPoint, setGpsPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [booking, placeBooking] = useState<Booking | null>(null);
  const advanceDemo = () => placeBooking(current => current ? { ...current, status: nextStatus(current.status) } : null);
  return <Context.Provider value={{ language, setLanguage, gpsPoint, setGpsPoint, booking, placeBooking, advanceDemo }}>{children}</Context.Provider>;
}

export function useDarbna() {
  const store = useContext(Context);
  if (!store) throw new Error('DarbnaProvider is missing');
  return store;
}
