import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateITN, generateInternalNumber, generatePlaceITN } from '@/lib/utils/itn';
import { calculateVolumetricWeight } from '@/lib/utils/volumetric';
import { calculateParcelCost } from '@/lib/utils/pricing';
import { requireStaff } from '@/lib/auth/guards';
import { ROLES } from '@/lib/constants/roles';

// GET /api/parcels — staff only. Drivers see only their own + unassigned.
// Admins/cashiers/warehouse see everything.
export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const currentUserId = guard.user.userId;
  const currentRole = guard.user.role;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const senderPhone = searchParams.get('senderPhone');
  const receiverPhone = searchParams.get('receiverPhone');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const tripId = searchParams.get('tripId');
  const courierId = searchParams.get('courierId');
  const unassigned = searchParams.get('unassigned');
  const q = searchParams.get('q');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
  const sortByParam = searchParams.get('sortBy') || 'createdAt';
  const sortOrderParam = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const allowedSortFields = ['createdAt', 'totalWeight', 'internalNumber', 'totalCost'] as const;
  const sortBy = (allowedSortFields as readonly string[]).includes(sortByParam) ? sortByParam : 'createdAt';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { deletedAt: null };

  if (status) where.status = status;
  if (tripId) where.tripId = tripId;
  if (courierId) where.assignedCourierId = courierId;
  if (unassigned === '1') where.assignedCourierId = null;

  // Driver scoping: drivers see only parcels assigned to them OR unassigned
  // (unless they explicitly pass ?courierId=other — which we reject below).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driverScope: any[] = [];
  if (currentRole === ROLES.DRIVER_COURIER) {
    if (courierId && courierId !== currentUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    driverScope.push(
      { assignedCourierId: currentUserId },
      { assignedCourierId: null },
    );
  }

  if (senderPhone) {
    where.sender = { phone: { contains: senderPhone } };
  }
  if (receiverPhone) {
    where.receiver = { phone: { contains: receiverPhone } };
  }
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59Z');
  }
  if (q) {
    // If query looks like place ITN (contains -), also search by base ITN
    const baseItn = q.includes('-') ? q.split('-')[0] : null;

    where.OR = [
      { itn: { contains: q } },
      ...(baseItn ? [{ itn: { contains: baseItn } }] : []),
      { internalNumber: { contains: q, mode: 'insensitive' as const } },
      { npTtn: { contains: q } },
      { places: { some: { itnPlace: q } } },
      { sender: { lastName: { contains: q, mode: 'insensitive' as const } } },
      { receiver: { lastName: { contains: q, mode: 'insensitive' as const } } },
      { sender: { phone: { contains: q } } },
      { receiver: { phone: { contains: q } } },
    ];
  }

  // Combine driver scope with any existing where.OR via AND
  if (driverScope.length > 0) {
    if (where.OR) {
      where.AND = [
        { OR: where.OR },
        { OR: driverScope },
      ];
      delete where.OR;
    } else {
      where.OR = driverScope;
    }
  }

  const [parcels, total] = await Promise.all([
    prisma.parcel.findMany({
      where,
      include: {
        sender: { select: { id: true, phone: true, firstName: true, lastName: true } },
        receiver: { select: { id: true, phone: true, firstName: true, lastName: true } },
        receiverAddress: { select: { city: true, street: true, building: true, npWarehouseNum: true, deliveryMethod: true } },
        places: { orderBy: { placeNumber: 'asc' } },
      },
      orderBy: { [sortBy]: sortOrderParam },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.parcel.count({ where }),
  ]);

  return NextResponse.json({
    parcels,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

// POST /api/parcels — create new parcel
export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const user = { id: guard.user.userId };

  const body = await request.json();
  const {
    senderId, senderAddressId,
    receiverId, receiverAddressId,
    direction, shipmentType, description, declaredValue,
    payer, paymentMethod, paymentInUkraine, needsPackaging,
    places, tripId,
    // Collection (how we receive the parcel from sender — EU→UA only)
    collectionMethod, collectionPointId, collectionDate, collectionAddress,
  } = body;

  if (!senderId || !receiverId || !direction) {
    return NextResponse.json({ error: 'Відправник, отримувач та напрямок обов\'язкові' }, { status: 400 });
  }

  if (!places || places.length === 0) {
    return NextResponse.json({ error: 'Додайте хоча б одне місце' }, { status: 400 });
  }

  // Get receiver city for internal number
  const receiver = await prisma.client.findUnique({
    where: { id: receiverId },
    include: { addresses: { where: receiverAddressId ? { id: receiverAddressId } : {}, take: 1 } },
  });
  const receiverCity = receiver?.addresses[0]?.city || 'Невідомо';

  // Generate sequential number atomically
  const currentYear = new Date().getFullYear();
  const sequence = await prisma.yearlySequence.update({
    where: { year: currentYear },
    data: { lastNumber: { increment: 1 } },
  });
  const seqNum = sequence.lastNumber;

  // Generate identifiers
  const itn = generateITN(currentYear, seqNum);
  const now = new Date();
  const totalPlaces = places.length;

  // Calculate weights
  let totalWeight = 0;
  let totalVolWeight = 0;

  const placesData = places.map((p: { weight?: number; length?: number; width?: number; height?: number; volume?: number; needsPackaging?: boolean }, i: number) => {
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
      volume: p.volume ? Number(p.volume) : null,
      volumetricWeight: volW,
      needsPackaging: p.needsPackaging || false,
      itnPlace: generatePlaceITN(itn, i + 1, totalPlaces),
      barcodeData: generatePlaceITN(itn, i + 1, totalPlaces),
    };
  });

  const internalNumber = generateInternalNumber(seqNum, receiverCity, 1, totalPlaces, now);
  const initialStatus = direction === 'eu_to_ua' ? 'accepted_for_transport_to_ua' : 'accepted_for_transport_to_eu';

  // Calculate cost from pricing config
  let deliveryCost = 0, packagingCost = 0, insuranceCost = 0, addressDeliveryCost = 0, totalCost = 0;
  const senderData = await prisma.client.findUnique({ where: { id: senderId }, include: { addresses: { take: 1 } } });
  const pricingCountry = direction === 'eu_to_ua'
    ? (senderData?.country || senderData?.addresses[0]?.country)
    : (receiver?.country || receiver?.addresses[0]?.country);

  if (pricingCountry) {
    const config = await prisma.pricingConfig.findFirst({
      where: { country: pricingCountry, direction, isActive: true },
    });
    if (config) {
      const receiverAddr = receiverAddressId
        ? await prisma.clientAddress.findUnique({ where: { id: receiverAddressId } })
        : receiver?.addresses[0];
      const costResult = calculateParcelCost(
        {
          pricePerKg: Number(config.pricePerKg),
          weightType: config.weightType as 'actual' | 'volumetric' | 'average',
          insuranceThreshold: Number(config.insuranceThreshold),
          insuranceRate: Number(config.insuranceRate),
          insuranceEnabled: config.insuranceEnabled,
          packagingEnabled: config.packagingEnabled,
          packagingPrices: config.packagingPrices as Record<string, number> | null,
          addressDeliveryPrice: Number(config.addressDeliveryPrice),
        },
        {
          actualWeight: totalWeight,
          volumetricWeight: totalVolWeight,
          declaredValue: declaredValue ? Number(declaredValue) : 0,
          needsPackaging: needsPackaging || false,
          isAddressDelivery: receiverAddr?.deliveryMethod === 'address',
        }
      );
      deliveryCost = costResult.deliveryCost;
      packagingCost = costResult.packagingCost;
      insuranceCost = costResult.insuranceCost;
      addressDeliveryCost = costResult.addressDeliveryCost;
      totalCost = costResult.totalCost;
    }
  }

  // Assign short number if linked to trip
  let shortNumber: number | null = null;
  if (tripId) {
    // Determine which counter to use based on country/direction
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (trip) {
      let counterField: string;
      if (direction === 'eu_to_ua') {
        counterField = 'shortNumberCounterEuUa';
      } else if (trip.country === 'NL') {
        counterField = 'shortNumberCounterNl';
      } else if (trip.country === 'AT') {
        // Check receiver city for Vienna/Linz/Geo distinction — default to Vienna for now
        counterField = 'shortNumberCounterVienna';
      } else {
        counterField = 'shortNumberCounterGeo';
      }
      const updatedTrip = await prisma.trip.update({
        where: { id: tripId },
        data: { [counterField]: { increment: 1 } },
      });
      // Map counter to range
      const counterValue = (updatedTrip as Record<string, unknown>)[counterField] as number;
      const ranges: Record<string, number> = {
        shortNumberCounterNl: 0,
        shortNumberCounterVienna: 100,
        shortNumberCounterLinz: 200,
        shortNumberCounterGeo: 300,
        shortNumberCounterEuUa: 500,
      };
      shortNumber = (ranges[counterField] || 0) + counterValue;
    }
  }

  // Save description suggestion
  if (description) {
    await prisma.descriptionSuggestion.upsert({
      where: { text: description },
      update: { usageCount: { increment: 1 } },
      create: { text: description },
    }).catch(() => {}); // ignore if duplicate
  }

  // Increment address usage
  if (receiverAddressId) {
    await prisma.clientAddress.update({
      where: { id: receiverAddressId },
      data: { usageCount: { increment: 1 } },
    });
  }
  if (senderAddressId) {
    await prisma.clientAddress.update({
      where: { id: senderAddressId },
      data: { usageCount: { increment: 1 } },
    });
  }

  const parcel = await prisma.parcel.create({
    data: {
      itn,
      internalNumber,
      sequentialNumber: seqNum,
      shortNumber,
      direction,
      senderId,
      senderAddressId: senderAddressId || null,
      receiverId,
      receiverAddressId: receiverAddressId || null,
      tripId: tripId || null,
      shipmentType: shipmentType || 'parcels_cargo',
      description: description || null,
      declaredValue: declaredValue ? Number(declaredValue) : null,
      totalWeight,
      totalVolumetricWeight: totalVolWeight,
      totalPlacesCount: totalPlaces,
      payer: payer || 'sender',
      paymentMethod: paymentMethod || 'cash',
      paymentInUkraine: paymentInUkraine || false,
      needsPackaging: needsPackaging || false,
      deliveryCost: deliveryCost || null,
      packagingCost: packagingCost || null,
      insuranceCost: insuranceCost || null,
      addressDeliveryCost: addressDeliveryCost || null,
      totalCost: totalCost || null,
      // Collection (only valid for eu_to_ua)
      collectionMethod: direction === 'eu_to_ua' && collectionMethod ? collectionMethod : null,
      collectionPointId:
        direction === 'eu_to_ua' && collectionMethod === 'pickup_point' && collectionPointId
          ? collectionPointId
          : null,
      collectionDate: collectionDate ? new Date(collectionDate) : null,
      collectionAddress:
        direction === 'eu_to_ua' && collectionMethod === 'courier_pickup' && collectionAddress
          ? String(collectionAddress)
          : null,
      status: initialStatus as import('@/generated/prisma/client').ParcelStatus,
      createdSource: 'worker',
      createdById: user.id,
      places: {
        create: placesData,
      },
      statusHistory: {
        create: {
          status: initialStatus as import('@/generated/prisma/client').ParcelStatus,
          changedById: user.id,
          notes: 'Створено',
        },
      },
    },
    include: {
      sender: { select: { phone: true, firstName: true, lastName: true } },
      receiver: { select: { phone: true, firstName: true, lastName: true } },
      places: true,
    },
  });

  return NextResponse.json(parcel, { status: 201 });
}
