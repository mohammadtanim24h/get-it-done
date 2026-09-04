import type { CookieOptions } from 'express';
import { env } from '../config/env';

export const authCookieName = env.jwtCookieName;

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction, // HTTPS-only outside local development
  sameSite: 'lax',
  path: '/',
};
