import type { CookieOptions } from 'express';
import { env } from '../config/env';

export const authCookieName = env.jwtCookieName;

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction, // HTTPS-only outside local development
  // In production the frontend (Vercel) and backend (Render) live on
  // different sites, and 'lax' cookies are never sent on cross-site
  // requests — every authenticated call would 401. 'none' requires
  // secure: true, which is already enforced in production.
  sameSite: env.isProduction ? 'none' : 'lax',
  path: '/',
};
