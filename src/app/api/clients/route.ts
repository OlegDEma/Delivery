import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';
import { requireStaff } from '@/lib/auth/guards';
import { phoneSchema, countrySchema, deliveryMethodSchema, safeJson } from '@/lib/validators/common';

// Per QA pass — without Zod, very long names (1000+ chars) silently land in
// DB and break list layout. Cap at sane limits matching DB column intent.
const createClientSchema = z.object({
  phone: phoneSchema,
  firstName: z.string().trim().min(1, 'Ім\'я обов\'язкове').max(100),
  lastName: z.string().trim().min(1, 'Прізвище обов\'язкове').max(100),
  middleName: z.string().trim().max(100).optional().nullable(),
  clientType: z.enum(['individual', 'organization']).optional(),
  organizationName: z.string().trim().max(200).optional().nullable(),
  country: countrySchema.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  address: z.object({
    country: countrySchema,
    city: z.string().trim().min(1).max(200),
    street: z.string().trim().max(200).optional().nullable(),
    building: z.string().trim().max(50).optional().nullable(),
    apartment: z.string().trim().max(50).optional().nullable(),
    postalCode: z.string().trim().max(20).optional().nullable(),
    landmark: z.string().trim().max(300).optional().nullable(),
    npWarehouseNum: z.string().trim().max(50).optional().nullable(),
    npPoshtamatNum: z.string().trim().max(50).optional().nullable(),
    pickupPointText: z.string().trim().max(500).optional().nullable(),
    deliveryMethod: deliveryMethodSchema.optional(),
  }).optional(),
});

// GET /api/clients?q=search&page=1&limit=20 — staff only
export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() || '';
  const role = searchParams.get('role') === 'receiver' ? 'receiver'
    : searchParams.get('role') === 'sender' ? 'sender'
    : null;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
  const skip = (page - 1) * limit;

  const normalized = normalizePhone(q || '');
  const isPhoneQuery = normalized.length >= 3;

  const where = q
    ? {
        deletedAt: null,
        OR: [
          ...(isPhoneQuery ? [
            { phoneNormalized: { contains: normalized } },
            { phone: { contains: q } },
          ] : []),
          { lastName: { contains: q, mode: 'insensitive' as const } },
          { firstName: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : { deletedAt: null };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        addresses: {
          orderBy: { usageCount: 'desc' },
        },
        // Last parcel where this client was sender or receiver — to get last used address
        sentParcels: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { senderAddressId: true },
        },
        receivedParcels: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { receiverAddressId: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.client.count({ where }),
  ]);

  // Reorder addresses: put last-used address from latest parcel first.
  // When `role` is given, prefer the address used in THAT role (per ТЗ:
  // «беруться з останніх наявних даних» — для Отримувача показуємо адресу
  // з останньої посилки, де клієнт був Отримувачем; для Відправника — навпаки).
  const processedClients = clients.map(c => {
    const lastSentAddrId = c.sentParcels?.[0]?.senderAddressId ?? null;
    const lastRecvAddrId = c.receivedParcels?.[0]?.receiverAddressId ?? null;
    const preferredAddrId =
      role === 'receiver' ? (lastRecvAddrId ?? lastSentAddrId)
      : role === 'sender' ? (lastSentAddrId ?? lastRecvAddrId)
      : (lastSentAddrId ?? lastRecvAddrId);

    let reorderedAddresses = [...c.addresses];
    if (preferredAddrId) {
      const idx = reorderedAddresses.findIndex(a => a.id === preferredAddrId);
      if (idx > 0) {
        const [addr] = reorderedAddresses.splice(idx, 1);
        reorderedAddresses.unshift(addr);
      }
    }

    const { sentParcels, receivedParcels, ...clientData } = c;
    void sentParcels; void receivedParcels;
    return { ...clientData, addresses: reorderedAddresses };
  });

  return NextResponse.json({
    clients: processedClients,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

// POST /api/clients — create new client (staff only)
export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const user = { id: guard.user.userId };

  const raw = await safeJson(request);
  if (raw === null) return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 });
  const parsed = createClientSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first ? `${first.path.join('.')}: ${first.message}` : 'Невалідні дані';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { phone, firstName, lastName, middleName, clientType, organizationName, country, notes, address } = parsed.data;

  // Check if phone already exists. Note: check + create is NOT atomic; a
  // race between two simultaneous POSTs would let both pass this check.
  // The unique constraint on Client.phone catches it — handled by the
  // try/catch below (P2002 → 409 instead of generic 500).
  // Match both raw phone AND normalized form so two differently-formatted
  // versions of the same number ("+380501234567" vs "+380 (50) 123-45-67")
  // don't create duplicate clients.
  const normalized = normalizePhone(phone);
  const existing = await prisma.client.findFirst({
    where: { OR: [{ phone }, { phoneNormalized: normalized }], deletedAt: null },
  });
  if (existing) {
    return NextResponse.json({ error: 'Клієнт з таким номером вже існує' }, { status: 409 });
  }

  let client;
  try {
    client = await prisma.client.create({
    data: {
      phone,
      phoneNormalized: normalizePhone(phone),
      firstName: capitalize(firstName),
      lastName: capitalize(lastName),
      middleName: middleName ? capitalize(middleName) : null,
      clientType: clientType || 'individual',
      organizationName: organizationName || null,
      country: country || null,
      notes: notes || null,
      createdById: user.id,
      addresses: address
        ? {
            create: {
              country: address.country,
              city: address.city,
              street: address.street || null,
              building: address.building || null,
              apartment: address.apartment || null,
              postalCode: address.postalCode || null,
              landmark: address.landmark || null,
              npWarehouseNum: address.npWarehouseNum || null,
              npPoshtamatNum: address.npPoshtamatNum || null,
              pickupPointText: address.pickupPointText || null,
              deliveryMethod: address.deliveryMethod || 'address',
              isDefault: true,
            },
          }
        : undefined,
    },
    include: { addresses: true },
    });
  } catch (err) {
    // Prisma unique-constraint violation — race condition with concurrent POST
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Клієнт з таким номером вже існує' }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json(client, { status: 201 });
}
