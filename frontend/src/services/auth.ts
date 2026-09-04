import { apiClient } from './api-client';
import type { ApiEnvelope } from '@/types/api';
import type { User } from '@/types/models';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

/**
 * Auth is an httpOnly `access_token` cookie set by the backend on login.
 * The browser manages the token; this service never touches it. Register
 * does NOT set the cookie — callers must log in afterwards (AuthProvider
 * handles this).
 */
export const authService = {
  async me(): Promise<User> {
    const { data } = await apiClient.get<ApiEnvelope<{ user: User }>>('/auth/me');
    return data.user;
  },

  async login(input: LoginInput): Promise<User> {
    const { data } = await apiClient.post<ApiEnvelope<{ user: User }>>('/auth/login', input);
    return data.user;
  },

  async register(input: RegisterInput): Promise<User> {
    const { data } = await apiClient.post<ApiEnvelope<{ user: User }>>('/auth/register', input);
    return data.user;
  },

  // The backend has no logout endpoint and the cookie is httpOnly, so
  // logging out only clears client-side session state. The cookie expires
  // server-side (default 1h).
  logout(): void {
    // Intentional no-op at the transport layer.
  },
};
