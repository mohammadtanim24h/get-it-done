import bcrypt from 'bcryptjs';

// Cost factor for bcrypt. 12 rounds is a reasonable 2026 default:
// strong against offline brute force, ~250ms hash time on typical hardware.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

/**
 * Comparison against a fixed dummy hash, used when an email does not exist
 * so that login timing does not reveal whether the account exists.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.WT8Fi1xbCGUdIY0LZBkc8oUPh4J34Q2';

export function fakeVerifyPassword(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, DUMMY_HASH);
}
