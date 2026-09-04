import type { Request, Response, NextFunction } from 'express';
import { registerUser, loginUser, getUserById } from '../services/authService';
import { registerSchema, loginSchema, parseOrThrow } from '../validators/authValidators';
import { signAccessToken } from '../utils/jwt';
import { authCookieName, authCookieOptions } from '../utils/cookie';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseOrThrow(registerSchema, req.body);
    const user = await registerUser(input);
    res.status(201).json({ data: { user } });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseOrThrow(loginSchema, req.body);
    const user = await loginUser(input);
    const token = signAccessToken({ sub: user.id, email: user.email });
    res.cookie(authCookieName, token, authCookieOptions);
    res.status(200).json({ data: { user } });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // requireAuth guarantees req.user is set on this route.
    const user = await getUserById(req.user!.id);
    res.status(200).json({ data: { user } });
  } catch (error) {
    next(error);
  }
}
