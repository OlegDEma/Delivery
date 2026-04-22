import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET /api/client-portal/me — дані поточного клієнта для prefill форми
// «Нове замовлення». Повертає контакти з Client + найчастіше використовувану
// адресу (останню) як підказку для country/city.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) return NextResponse.json(null);

  const client = await prisma.client.findUnique({
    where: { phone: profile.phone },
    include: {
      addresses: { orderBy: { usageCount: 'desc' }, take: 1 },
    },
  });
  if (!client) return NextResponse.json(null);

  // Якщо в клієнта нема збережених адрес — спробуємо останнє відправлення
  // (адреса ВІДПРАВНИКА з останньої посилки).
  let fallback: { country: string; city: string | null } | null = null;
  if (client.addresses.length === 0) {
    const last = await prisma.parcel.findFirst({
      where: { senderId: client.id, deletedAt: null, senderAddressId: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: { senderAddress: true },
    });
    if (last?.senderAddress) {
      fallback = { country: last.senderAddress.country, city: last.senderAddress.city };
    }
  }

  const addr = client.addresses[0];
  return NextResponse.json({
    firstName: client.firstName,
    lastName: client.lastName,
    phone: client.phone,
    country: addr?.country ?? fallback?.country ?? null,
    city: addr?.city ?? fallback?.city ?? null,
  });
}
