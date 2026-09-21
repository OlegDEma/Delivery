import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';

// Перевірка перед запуском 21.09.26: Supabase Auth відповідає англійською
// («A user with this email address has already been registered»), і цей текст
// показувався клієнту як є. Перекладаємо типові відповіді, решту — узагальнюємо.
function authErrorToUkrainian(message?: string): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('already been registered') || m.includes('already registered') || m.includes('already exists')) {
    return 'Такий email уже зареєстрований. Увійдіть або скористайтесь «Забули пароль?».';
  }
  if (m.includes('password') && (m.includes('at least') || m.includes('weak') || m.includes('valid password'))) {
    return 'Пароль має бути мінімум 6 символів.';
  }
  if (m.includes('email') && (m.includes('invalid') || m.includes('validate'))) {
    return 'Некоректний email. Перевірте адресу.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Забагато спроб. Спробуйте через кілька хвилин.';
  }
  return 'Не вдалося створити акаунт. Перевірте дані або спробуйте пізніше.';
}

// POST /api/client-portal — register new client user
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password, firstName, lastName, phone } = body;

  if (!email || !password || !firstName || !lastName || !phone) {
    return NextResponse.json({ error: 'Всі поля обов\'язкові' }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  // Create auth user
  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: authErrorToUkrainian(authError?.message) }, { status: 400 });
  }

  // Create profile with client role
  await prisma.profile.create({
    data: {
      id: authData.user.id,
      email,
      fullName: `${capitalize(lastName)} ${capitalize(firstName)}`,
      phone,
      role: 'client',
    },
  });

  // Create or link client record
  let client = await prisma.client.findUnique({ where: { phone } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        phone,
        phoneNormalized: normalizePhone(phone),
        firstName: capitalize(firstName),
        lastName: capitalize(lastName),
      },
    });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
