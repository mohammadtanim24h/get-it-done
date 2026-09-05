'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { LoginInput, RegisterInput } from '@/services/auth';
import { authService } from '@/services/auth';
import type { User } from '@/types/models';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Hydrate the session from the httpOnly auth cookie on mount.
  useEffect(() => {
    let cancelled = false;
    authService
      .me()
      .then((current) => {
        if (cancelled) return;
        setUser(current);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus('unauthenticated');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const current = await authService.login(input);
    setUser(current);
    setStatus('authenticated');
  }, []);

  // Register does not set the auth cookie, so log in right after.
  const register = useCallback(async (input: RegisterInput) => {
    await authService.register(input);
    const current = await authService.login({
      email: input.email,
      password: input.password,
    });
    setUser(current);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      // Ask the backend to clear the httpOnly cookie; clearing local state
      // even if the request fails so the UI never gets stuck signed in.
      await authService.logout();
    } catch {
      // ignore network errors — local state is cleared regardless
    }
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
