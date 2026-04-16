import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';
import { generateITN, generateInternalNumber, generatePlaceITN } from '@/lib/utils/itn';
import { calculateVolumetricWeight } from '@/lib/utils/volumetric';

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

  const body = await request.json();
  const {
    direction, shipmentType, description, declaredValue,
    payer, paymentMethod, paymentInUkraine,
    // Sender (the client themselves or someone else)
    senderPhone, senderFirstName, senderLastName, senderCity, senderStreet, senderCountry,
    // Receiver
    receiverPhone, receiverFirstName, receiverLastName, receiverCity, receiverStreet,
    receiverCountry, receiverNpWarehouse, receiverDeliveryMethod,
    // Places
    places,
    // Collection
    collectionMethod, collectionPointId, collectionDate, collectionAddress,
  } = body;

  if (!receiverPhone || !receiverFirstName || !receiverLastName) {
    return NextResponse.json({ error: 'Дані отримувача обов\'язкові' }, { status: 400 });
  }
  if (!places || places.length === 0) {
    return NextResponse.json({ error: 'Додайте хоча б одне місце' }, { status: 400 });
  }

  // SECURITY: Sender must always be the authenticated client themselves.
  // Ignore any senderPhone in the body to prevent spoofing someone else's identity.
  let sender = await prisma.client.findUnique({
    where: { phone: profile.phone },
  });
  if (!sender) {
    // First order for this user — create Client record linked to their profile phone
    const profileNameParts = (profile.fullName || '').split(' ');
    sender = await prisma.client.create({
      data: {
        phone: profile.phone,
        phoneNormalized: normalizePhone(profile.phone),
        firstName: capitalize(senderFirstName || profileNameParts[1] || profileNameParts[0] || ''),
        lastName: capitalize(senderLastName || profileNameParts[0] || ''),
        country: senderCountry || null,
      },
    });
  }

  // Add sender address if provided
  let senderAddressId: string | null = null;
  if (senderCity) {
    const addr = await prisma.clientAddress.create({
      data: {
        clientId: sender.id,
        country: senderCountry || 'UA',
        city: senderCity,
        street: senderStreet || null,
      },
    });
    senderAddressId = addr.id;
  }

  // Find or create receiver
  let receiver = await prisma.client.findUnique({ where: { phone: receiverPhone } });
  if (!receiver) {
    receiver = await prisma.client.create({
      data: {
        phone: receiverPhone,
        phoneNormalized: normalizePhone(receiverPhone),
        firstName: capitalize(receiverFirstName),
        lastName: capitalize(receiverLastName),
        country: receiverCountry || null,
      },
    });
  }

  // Add receiver address
  let receiverAddressId: string | null = null;
  if (receiverCity) {
    const addr = await prisma.clientAddress.create({
      data: {
        clientId: receiver.id,
        country: receiverCountry || 'UA',
        city: receiverCity,
        street: receiverStreet || null,
        npWarehouseNum: receiverNpWarehouse || null,
        deliveryMethod: receiverDeliveryMethod || 'address',
      },
    });
    receiverAddressId = addr.id;
  }

  // Generate numbers
  const currentYear = new Date().getFullYear();
  const sequence = await prisma.yearlySequence.update({
    where: { year: currentYear },
    data: { lastNumber: { increment: 1 } },
  });
  const seqNum = sequence.lastNumber;
  const itn = generateITN(currentYear, seqNum);
  const now = new Date();
  const totalPlaces = places.length;

  let totalWeight = 0;
  let totalVolWeight = 0;
  const placesData = places.map((p: { weight?: number; length?: number; width?: number; height?: number }, i: number) => {
    const w = Number(p.weight) || 0;
    const volW = p.length && p.width && p.height
      ? calculateVolumetricWeight(Number(p.length), Number(p.width), Number(p.height))
      : 0;
    totalWeight += w;
    totalVolWeight += volW;
    return {
      placeNumber: i + 1,
      weight: w,
      length: p.length ? Number(p.length) : null,
      width: p.width ? Number(p.width) : null,
      height: p.height ? Number(p.height) : null,
      volumetricWeight: volW,
      itnPlace: generatePlaceITN(itn, i + 1, totalPlaces),
      barcodeData: generatePlaceITN(itn, i + 1, totalPlaces),
    };
  });

  const internalNumber = generateInternalNumber(seqNum, receiverCity || 'Невідомо', 1, totalPlaces, now);

  // Validate collection method
  const validMethods = ['pickup_point', 'courier_pickup', 'external_shipping', 'direct_to_driver'];
  const resolvedCollectionMethod = collectionMethod && validMethods.includes(collectionMethod)
    ? collectionMethod
    : null;

  // Collection point is only meaningful with pickup_point method
  const resolvedCollectionPointId =
    resolvedCollectionMethod === 'pickup_point' && collectionPointId
      ? collectionPointId
      : null;

  // Collection address is only meaningful with courier_pickup method
  const resolvedCollectionAddress =
    resolvedCollectionMethod === 'courier_pickup' && collectionAddress
      ? String(collectionAddress)
      : null;

  const parcel = await prisma.parcel.create({
    data: {
      itn,
      internalNumber,
      sequentialNumber: seqNum,
      direction: direction || 'eu_to_ua',
      senderId: sender.id,
      senderAddressId,
      receiverId: receiver.id,
      receiverAddressId,
      shipmentType: shipmentType || 'parcels_cargo',
      description: description || null,
      declaredValue: declaredValue ? Number(declaredValue) : null,
      totalWeight,
      totalVolumetricWeight: totalVolWeight,
      totalPlacesCount: totalPlaces,
      payer: payer || 'sender',
      paymentMethod: paymentMethod || 'cash',
      paymentInUkraine: paymentInUkraine || false,
      collectionMethod: resolvedCollectionMethod,
      collectionPointId: resolvedCollectionPointId,
      collectionDate: collectionDate ? new Date(collectionDate) : null,
      collectionAddress: resolvedCollectionAddress,
      status: 'draft',
      createdSource: 'client_web',
      createdById: user.id,
      places: { create: placesData },
      statusHistory: {
        create: { status: 'draft', changedById: user.id, notes: 'Створено клієнтом на сайті' },
      },
    },
  });

  return NextResponse.json(parcel, { status: 201 });
}
