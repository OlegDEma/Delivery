import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';

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
    return NextResponse.json({ error: authError?.message || 'Помилка створення' }, { status: 400 });
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
