import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../utils/appError';
import { verifyAccessToken } from '../utils/jwt';
import { authCookieName } from '../utils/cookie';

/**
 * Centralized authentication guard for protected routes.
 *
 * - Reads the JWT from the auth cookie.
 * - Rejects missing, invalid, and expired tokens consistently with 401.
 * - Attaches the authenticated identity to req.user (typed).
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  try {
    const token = req.cookies?.[authCookieName];
    if (typeof token !== 'string' || token === '') {
      throw new UnauthorizedError();
    }

    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (error) {
    next(error);
  }
};
