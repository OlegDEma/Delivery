import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { STAFF_ROLES } from '@/lib/constants/roles';
import type { UserRole } from '@/generated/prisma/client';

const VALID_ROLES: string[] = ['super_admin', 'admin', 'cashier', 'warehouse_worker', 'driver_courier', 'client'];

// GET /api/users — list all users (admin only)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check role
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ТЗ docx 28.09.26: «У вкладці "Адміністрування/Користувачі" повинні бути лише
  // працівники — водії, адміни, менеджери». Клієнти живуть у «Адміністрування/Клієнти»
  // (`/clients`), а тут їх було видно разом із персоналом (17 клієнтських профілів).
  // Дозволяємо ?role=client лише як свідомий запит (напр. для діагностики).
  const roleParam = new URL(request.url).searchParams.get('role');
  const roleFilter = VALID_ROLES.includes(roleParam ?? '') ? (roleParam as UserRole) : null;
  const profiles = await prisma.profile.findMany({
    where: roleFilter ? { role: roleFilter } : { role: { in: STAFF_ROLES as UserRole[] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json(profiles);
}

// POST /api/users — create new user (admin only)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }
  const { email, password, fullName, phone, role } = body;

  if (!email || !password || !fullName || !role) {
    return NextResponse.json(
      { error: 'Email, пароль, ПІБ та роль обов\'язкові' },
      { status: 400 }
    );
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Невалідна роль' }, { status: 400 });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'Пароль має містити мінімум 6 символів' }, { status: 400 });
  }

  // Create user in Supabase Auth using service role
  const serviceClient = await createServiceClient();
  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message || 'Помилка створення користувача' },
      { status: 400 }
    );
  }

  // Create profile
  const newProfile = await prisma.profile.create({
    data: {
      id: authData.user.id,
      email,
      fullName,
      phone: phone || null,
      role,
    },
  });

  return NextResponse.json(newProfile, { status: 201 });
}
