// shopdesk — app-wide session & business context
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, formatMoney, compactMoney } from './api.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = restoring session
  const [business, setBusiness] = useState(null);

  const refreshBusiness = useCallback(async () => {
    try { setBusiness(await api('/settings')); } catch { /* not signed in yet */ }
  }, []);

  useEffect(() => {
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  useEffect(() => { if (user) refreshBusiness(); }, [user, refreshBusiness]);

  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setUser(null);
    setBusiness(null);
  }, []);

  const currency = business?.currency || 'INR';
  const money = useCallback((n, fd = 2) => formatMoney(n, currency, fd), [currency]);
  const compact = useCallback((n) => compactMoney(n, currency), [currency]);

  const value = useMemo(
    () => ({ user, business, refreshBusiness, login, logout, currency, money, compact }),
    [user, business, refreshBusiness, login, logout, currency, money, compact]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
