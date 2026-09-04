// Auth-related shared types.

/** User data that is safe to send to clients. Never includes passwordHash. */
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

/** Minimal authenticated identity attached to req.user by requireAuth. */
export type AuthenticatedUser = {
  id: string;
  email: string;
};

/** JWT access token claims. Only non-sensitive claims. */
export type AccessTokenPayload = {
  sub: string; // user id
  email: string;
};

/** Successful auth endpoint responses: { data: { user: ... } } */
export type AuthResponseBody = {
  user: PublicUser;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth middleware; undefined on unauthenticated requests. */
      user?: AuthenticatedUser;
    }
  }
}
