import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import type { Role } from '@/lib/constants/roles';
import { ROLES } from '@/lib/constants/roles';

interface AuthedUser {
  userId: string;
  role: Role;
  email: string;
}

type GuardResult =
  | { ok: true; user: AuthedUser }
  | { ok: false; response: NextResponse };

/**
 * Require the request to come from an authenticated user.
 * Client (end-user) role is considered authenticated too.
 */
export async function requireAuth(): Promise<GuardResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true, email: true, isActive: true },
  });

  if (!profile || !profile.isActive) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true,
    user: { userId: user.id, role: profile.role as Role, email: profile.email },
  };
}

/**
 * Require the request to come from an internal staff member
 * (anyone who is NOT a client).
 */
export async function requireStaff(): Promise<GuardResult> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;

  if (auth.user.role === ROLES.CLIENT) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return auth;
}

/**
 * Require the request to come from a user with one of the allowed roles.
 */
export async function requireRole(allowed: Role[]): Promise<GuardResult> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;

  if (!allowed.includes(auth.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return auth;
}
