import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validators/common';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const configs = await prisma.pricingConfig.findMany({
    where: { isActive: true },
    orderBy: [{ country: 'asc' }, { direction: 'asc' }],
  });

  return NextResponse.json(configs);
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check admin role
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }
  const {
    id,
    pricePerKg, weightType,
    insuranceEnabled, insuranceRate, insuranceThreshold,
    packagingEnabled, packagingPer10kg,
    parcelMoneyPercent,
    addressDeliveryPrice, pickupPointPrice,
    minMultiPerAddress, minBothDirections,
    collectionDays,
  } = body;

  if (!id) return NextResponse.json({ error: 'ID обов\'язковий' }, { status: 400 });
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const exists = await prisma.pricingConfig.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Конфіг не знайдено' }, { status: 404 });

  // Validate numeric inputs — Prisma accepts negative or string values which
  // would corrupt the pricing. Reject before update.
  const validNumber = (v: unknown, min: number, max: number, label: string): string | null => {
    if (v === null) return null; // null = «не змінювати», ігноруємо
    const n = Number(v);
    if (!Number.isFinite(n)) return `${label}: очікується число`;
    if (n < min) return `${label}: не може бути менше ${min}`;
    if (n > max) return `${label}: не може бути більше ${max}`;
    return null;
  };
  const checks: Array<[unknown, number, number, string]> = [
    [pricePerKg,           0, 1000,   'pricePerKg'],
    [addressDeliveryPrice, 0, 1000,   'addressDeliveryPrice'],
    [pickupPointPrice,     0, 1000,   'pickupPointPrice'],
    [minMultiPerAddress,   0, 1000,   'minMultiPerAddress'],
    [minBothDirections,    0, 1000,   'minBothDirections'],
    [packagingPer10kg,     0, 1000,   'packagingPer10kg'],
    [insuranceRate,        0, 1,      'insuranceRate (0..1)'],
    [parcelMoneyPercent,   0, 100,    'parcelMoneyPercent'],
    [insuranceThreshold,   0, 100000, 'insuranceThreshold'],
  ];
  for (const [v, min, max, label] of checks) {
    if (v !== undefined) {
      const e = validNumber(v, min, max, label);
      if (e) return NextResponse.json({ error: e }, { status: 400 });
    }
  }
  if (weightType !== undefined && !['actual', 'volumetric', 'average'].includes(weightType)) {
    return NextResponse.json({ error: 'weightType: actual/volumetric/average' }, { status: 400 });
  }

  // Numeric fields: only update when caller supplied a non-null value. `null`
  // means "user cleared the input — keep DB unchanged" (UI guards against
  // submitting null for required fields, see pricing/page.tsx validation).
  const numIfPresent = (v: unknown) => (v !== undefined && v !== null ? Number(v) : undefined);

  const updated = await prisma.pricingConfig.update({
    where: { id },
    data: {
      ...(numIfPresent(pricePerKg)           !== undefined && { pricePerKg:           numIfPresent(pricePerKg)! }),
      ...(weightType                         !== undefined && { weightType }),
      ...(insuranceEnabled                   !== undefined && { insuranceEnabled }),
      ...(numIfPresent(insuranceRate)        !== undefined && { insuranceRate:        numIfPresent(insuranceRate)! }),
      ...(numIfPresent(insuranceThreshold)   !== undefined && { insuranceThreshold:   numIfPresent(insuranceThreshold)! }),
      ...(packagingEnabled                   !== undefined && { packagingEnabled }),
      ...(numIfPresent(packagingPer10kg)     !== undefined && { packagingPer10kg:     numIfPresent(packagingPer10kg)! }),
      ...(numIfPresent(parcelMoneyPercent)   !== undefined && { parcelMoneyPercent:   numIfPresent(parcelMoneyPercent)! }),
      ...(numIfPresent(addressDeliveryPrice) !== undefined && { addressDeliveryPrice: numIfPresent(addressDeliveryPrice)! }),
      ...(numIfPresent(pickupPointPrice)     !== undefined && { pickupPointPrice:     numIfPresent(pickupPointPrice)! }),
      ...(numIfPresent(minMultiPerAddress)   !== undefined && { minMultiPerAddress:   numIfPresent(minMultiPerAddress)! }),
      ...(numIfPresent(minBothDirections)    !== undefined && { minBothDirections:    numIfPresent(minBothDirections)! }),
      ...(collectionDays                     !== undefined && { collectionDays }),
      updatedById: user.id,
    },
  });

  return NextResponse.json(updated);
}
