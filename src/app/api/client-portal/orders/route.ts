import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { canonicalPhone, normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';
import { parseBody, clientOrderSchema } from '@/lib/validators';
import { createParcel } from '@/lib/services/parcel-creation';
import { logger } from '@/lib/logger';
import type { Country } from '@/generated/prisma/enums';

// GET /api/client-portal/orders — get client's orders
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Find client by profile phone
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) return NextResponse.json([]);

  const client = await prisma.client.findUnique({ where: { phone: profile.phone } });
  if (!client) return NextResponse.json([]);

  const parcels = await prisma.parcel.findMany({
    where: {
      deletedAt: null,
      OR: [{ senderId: client.id }, { receiverId: client.id }],
    },
    include: {
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
      receiverAddress: { select: { city: true, deliveryMethod: true, npWarehouseNum: true } },
      statusHistory: {
        orderBy: { changedAt: 'desc' },
        take: 1,
        select: { changedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(parcels);
}

// POST /api/client-portal/orders — create order by client
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) {
    return NextResponse.json({ error: 'Профіль не знайдено' }, { status: 400 });
  }
  if (!profile.fullName || !profile.fullName.trim()) {
    return NextResponse.json(
      { error: 'Заповніть ПІБ у профілі, перш ніж створювати замовлення' },
      { status: 400 }
    );
  }

  const parsed = await parseBody(request, clientOrderSchema);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed;

  // Per ТЗ: client must explicitly pick direction («Виберіть напрямок» — без
  // дефолту). Reject if missing instead of silently defaulting.
  if (!body.direction) {
    return NextResponse.json({ error: 'Виберіть напрямок' }, { status: 400 });
  }

  // SECURITY: Sender must always be the authenticated client themselves.
  // Ignore any senderPhone in the body to prevent spoofing.
  let sender = await prisma.client.findUnique({
    where: { phone: profile.phone },
  });
  if (!sender) {
    const profileNameParts = profile.fullName.split(/\s+/).filter(Boolean);
    sender = await prisma.client.create({
      data: {
        phone: profile.phone,
        phoneNormalized: normalizePhone(profile.phone),
        firstName: capitalize(body.senderFirstName || profileNameParts[1] || profileNameParts[0] || 'Клієнт'),
        lastName: capitalize(body.senderLastName || profileNameParts[0] || 'Клієнт'),
        country: (body.senderCountry ?? null) as Country | null,
      },
    });
  }

  // Sender address: dedupe per client by (country, city, street).
  let senderAddressId: string | null = null;
  if (body.senderCity) {
    const senderCountry = (body.senderCountry ?? 'UA') as Country;
    const existingSenderAddr = await prisma.clientAddress.findFirst({
      where: {
        clientId: sender.id,
        country: senderCountry,
        city: body.senderCity,
        street: body.senderStreet || null,
      },
    });
    if (existingSenderAddr) {
      senderAddressId = existingSenderAddr.id;
    } else {
      const addr = await prisma.clientAddress.create({
        data: {
          clientId: sender.id,
          country: senderCountry,
          city: body.senderCity,
          street: body.senderStreet || null,
        },
      });
      senderAddressId = addr.id;
    }
  }

  // Find or create receiver — normalize the phone first so "+38 050…" and
  // "+380 50…" resolve to the same client.
  const canonicalReceiverPhone = canonicalPhone(body.receiverPhone);
  if (!canonicalReceiverPhone) {
    return NextResponse.json({ error: 'Невалідний номер телефону отримувача' }, { status: 400 });
  }
  let receiver = await prisma.client.findUnique({ where: { phone: canonicalReceiverPhone } });
  if (!receiver) {
    receiver = await prisma.client.create({
      data: {
        phone: canonicalReceiverPhone,
        phoneNormalized: normalizePhone(canonicalReceiverPhone),
        firstName: capitalize(body.receiverFirstName),
        lastName: capitalize(body.receiverLastName),
        country: (body.receiverCountry ?? null) as Country | null,
      },
    });
  }

  // Receiver address: same dedupe strategy.
  let receiverAddressId: string | null = null;
  if (body.receiverCity) {
    const receiverCountry = (body.receiverCountry ?? 'UA') as Country;
    const existingReceiverAddr = await prisma.clientAddress.findFirst({
      where: {
        clientId: receiver.id,
        country: receiverCountry,
        city: body.receiverCity,
        street: body.receiverStreet || null,
        npWarehouseNum: body.receiverNpWarehouse || null,
      },
    });
    if (existingReceiverAddr) {
      receiverAddressId = existingReceiverAddr.id;
    } else {
      const addr = await prisma.clientAddress.create({
        data: {
          clientId: receiver.id,
          country: receiverCountry,
          city: body.receiverCity,
          street: body.receiverStreet || null,
          npWarehouseNum: body.receiverNpWarehouse || null,
          deliveryMethod: body.receiverDeliveryMethod || 'address',
        },
      });
      receiverAddressId = addr.id;
    }
  }

  try {
    const created = await createParcel({
      senderId: sender.id,
      senderAddressId,
      receiverId: receiver.id,
      receiverAddressId,
      tripId: null,
      direction: body.direction ?? 'eu_to_ua',
      shipmentType: body.shipmentType,
      description: body.description ?? null,
      declaredValue: body.declaredValue ?? null,
      payer: body.payer,
      paymentMethod: body.paymentMethod,
      paymentInUkraine: body.paymentInUkraine,
      places: body.places,
      createdById: user.id,
      createdSource: 'client_web',
      status: 'draft',
      statusNote: 'Створено клієнтом на сайті',
      collectionMethod: body.collectionMethod ?? null,
      collectionPointId: body.collectionPointId ?? null,
      collectionDate: body.collectionDate ? new Date(body.collectionDate) : null,
      collectionAddress: body.collectionAddress ?? null,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.startsWith('TRIP_NOT_ACCEPTING:')) {
      const tripStatus = msg.split(':')[1];
      const label = tripStatus === 'completed' ? 'завершено' : 'скасовано';
      return NextResponse.json({ error: `Рейс уже ${label} — нові посилки додавати не можна.` }, { status: 409 });
    }
    const fkErrors: Record<string, string> = {
      SENDER_NOT_FOUND: 'Відправника не знайдено',
      RECEIVER_NOT_FOUND: 'Отримувача не знайдено',
      SENDER_ADDRESS_NOT_FOUND: 'Адресу відправника не знайдено',
      RECEIVER_ADDRESS_NOT_FOUND: 'Адресу отримувача не знайдено',
      TRIP_NOT_FOUND: 'Рейс не знайдено',
      COLLECTION_POINT_NOT_FOUND: 'Пункт збору не знайдено',
    };
    if (fkErrors[msg]) return NextResponse.json({ error: fkErrors[msg] }, { status: 404 });
    logger.error('client_portal.order.create_failed', err, { userId: user.id });
    return NextResponse.json(
      { error: 'Не вдалося створити замовлення. Спробуйте ще раз.' },
      { status: 500 }
    );
  }
}
