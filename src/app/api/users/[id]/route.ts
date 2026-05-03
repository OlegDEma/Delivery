import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { isUuid } from '@/lib/validators/common';

// PATCH /api/users/[id] — update user role or deactivate
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  // Safety: can't change own role or deactivate self — otherwise super_admin
  // can lock themselves out of the system
  if (id === user.id) {
    if (body.role !== undefined && body.role !== profile.role) {
      return NextResponse.json(
        { error: 'Не можна змінити свою роль — зверніться до іншого Суперадміна' },
        { status: 400 }
      );
    }
    if (body.isActive === false) {
      return NextResponse.json(
        { error: 'Не можна деактивувати свій акаунт' },
        { status: 400 }
      );
    }
  }

  // Validate role value
  if (body.role !== undefined) {
    const validRoles = ['super_admin', 'admin', 'cashier', 'warehouse_worker', 'driver_courier', 'client'];
    if (!validRoles.includes(body.role)) {
      return NextResponse.json({ error: 'Невалідна роль' }, { status: 400 });
    }
  }

  // Email change needs to happen in Supabase Auth (source of truth for login)
  // AND in profile (mirror). Do Auth first — if it fails, profile stays consistent.
  if (body.email !== undefined && body.email !== null) {
    const newEmail = String(body.email).trim().toLowerCase();
    if (!newEmail) {
      return NextResponse.json({ error: 'Email не може бути пустим' }, { status: 400 });
    }
    // Basic email regex
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: 'Невалідний email' }, { status: 400 });
    }
    // Check uniqueness against other profiles
    const existing = await prisma.profile.findFirst({
      where: { email: newEmail, NOT: { id } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: 'Цей email уже використовується іншим користувачем' }, { status: 400 });
    }

    // Update in Supabase Auth only if changed
    const target = await prisma.profile.findUnique({ where: { id }, select: { email: true } });
    if (target && target.email !== newEmail) {
      const serviceClient = await createServiceClient();
      const { error: authErr } = await serviceClient.auth.admin.updateUserById(id, {
        email: newEmail,
        email_confirm: true,
      });
      if (authErr) {
        return NextResponse.json(
          { error: `Помилка оновлення email в Auth: ${authErr.message}` },
          { status: 400 }
        );
      }
      logger.audit('user.email_changed', {
        actorEmail: profile.email, targetUserId: id,
        from: target.email, to: newEmail,
      });
      await writeAuditLog({
        event: 'user.email_changed',
        actorId: user.id,
        subjectId: id,
        subjectType: 'user',
        payload: { from: target.email, to: newEmail },
      });
    }
  }

  const data: {
    role?: typeof body.role;
    isActive?: boolean;
    fullName?: string;
    phone?: string | null;
    email?: string;
  } = {};
  if (body.role !== undefined) data.role = body.role;
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.fullName !== undefined) data.fullName = String(body.fullName).trim();
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null;
  if (body.email !== undefined && body.email !== null) {
    data.email = String(body.email).trim().toLowerCase();
  }

  // Basic validation of fullName
  if (data.fullName !== undefined && data.fullName === '') {
    return NextResponse.json({ error: 'ПІБ не може бути пустим' }, { status: 400 });
  }

  // Capture old role for audit + verify user exists.
  const previous = await prisma.profile.findUnique({
    where: { id }, select: { role: true, isActive: true },
  });
  if (!previous) {
    return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });
  }

  const updated = await prisma.profile.update({
    where: { id },
    data,
    select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true },
  });

  if (data.role !== undefined && previous && previous.role !== data.role) {
    logger.audit('user.role_changed', {
      actorEmail: profile.email, targetUserId: id,
      from: previous.role, to: data.role,
    });
    await writeAuditLog({
      event: 'user.role_changed',
      actorId: user.id,
      subjectId: id,
      subjectType: 'user',
      payload: { from: previous.role, to: data.role },
    });
  }
  if (data.isActive !== undefined && previous && previous.isActive !== data.isActive) {
    await writeAuditLog({
      event: data.isActive ? 'user.activated' : 'user.deactivated',
      actorId: user.id,
      subjectId: id,
      subjectType: 'user',
      payload: {},
    });
  }

  return NextResponse.json(updated);
}

// DELETE /api/users/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  // Can't delete self
  if (id === user.id) {
    return NextResponse.json({ error: 'Не можна видалити свій акаунт' }, { status: 400 });
  }

  // Snapshot for audit before destroying.
  const target = await prisma.profile.findUnique({
    where: { id }, select: { email: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });
  }

  // Delete from Supabase Auth
  const serviceClient = await createServiceClient();
  await serviceClient.auth.admin.deleteUser(id);

  // Delete profile
  await prisma.profile.delete({ where: { id } });

  logger.audit('user.deleted', {
    actorEmail: profile.email, targetUserId: id, targetEmail: target?.email,
  });
  await writeAuditLog({
    event: 'user.deleted',
    actorId: user.id,
    subjectId: id,
    subjectType: 'user',
    payload: target ? { email: target.email, role: target.role } : {},
  });

  return NextResponse.json({ success: true });
}
