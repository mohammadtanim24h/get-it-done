import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/appError';
import type { AccessTokenPayload } from '../types/auth';

/** Sign an access token containing only non-sensitive claims. */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ email: payload.email }, env.jwtSecret, {
    subject: payload.sub,
    // env values are plain strings; @types/jsonwebtoken expects its StringValue type
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verify signature and expiration. Missing/invalid/expired tokens are all
 * rejected consistently with a 401 UnauthorizedError.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.email !== 'string') {
      throw new UnauthorizedError();
    }
    return { sub: decoded.sub, email: decoded.email };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    // TokenExpiredError, JsonWebTokenError, NotBeforeError — same response.
    throw new UnauthorizedError();
  }
}
