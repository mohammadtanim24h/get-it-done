// Centralized environment configuration. All backend URL construction goes
// through here so components and services never build URLs themselves.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const API_PREFIX =
  process.env.NEXT_PUBLIC_API_PREFIX ?? '/api';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${API_PREFIX}${path}`;
}
