import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword, fakeVerifyPassword } from '../utils/password';
import { ConflictError, UnauthorizedError } from '../utils/appError';
import type { PublicUser } from '../types/auth';
import type { RegisterInput, LoginInput } from '../validators/authValidators';

type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

/** Strip passwordHash. Every user returned by this service goes through this. */
function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  let user: UserRecord;
  try {
    user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
  } catch (error) {
    // Unique constraint on email — handles the concurrent-registration race.
    if ((error as { code?: string }).code === 'P2002') {
      throw new ConflictError('An account with this email already exists');
    }
    throw error;
  }
  return toPublicUser(user);
}

export async function loginUser(input: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Same generic error and comparable timing whether the email is unknown
  // or the password is wrong — prevents account enumeration via login.
  if (!user) {
    await fakeVerifyPassword(input.password);
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return toPublicUser(user);
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    // E.g. the user was deleted after the token was issued.
    throw new UnauthorizedError();
  }
  return toPublicUser(user);
}
