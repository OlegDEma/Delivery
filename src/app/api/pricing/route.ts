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
  const { id, pricePerKg, weightType, insuranceEnabled, insuranceRate, insuranceThreshold, packagingEnabled, addressDeliveryPrice, collectionDays } = body;

  if (!id) return NextResponse.json({ error: 'ID обов\'язковий' }, { status: 400 });
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const exists = await prisma.pricingConfig.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Конфіг не знайдено' }, { status: 404 });

  // Validate numeric inputs — Prisma accepts negative or string values which
  // would corrupt the pricing. Reject before update.
  const validNumber = (v: unknown, min: number, max: number, label: string): string | null => {
    const n = Number(v);
    if (!Number.isFinite(n)) return `${label}: очікується число`;
    if (n < min) return `${label}: не може бути менше ${min}`;
    if (n > max) return `${label}: не може бути більше ${max}`;
    return null;
  };
  if (pricePerKg !== undefined) {
    const e = validNumber(pricePerKg, 0, 1000, 'pricePerKg'); if (e) return NextResponse.json({ error: e }, { status: 400 });
  }
  if (addressDeliveryPrice !== undefined) {
    const e = validNumber(addressDeliveryPrice, 0, 1000, 'addressDeliveryPrice'); if (e) return NextResponse.json({ error: e }, { status: 400 });
  }
  if (insuranceRate !== undefined) {
    const e = validNumber(insuranceRate, 0, 1, 'insuranceRate (0..1)'); if (e) return NextResponse.json({ error: e }, { status: 400 });
  }
  if (insuranceThreshold !== undefined) {
    const e = validNumber(insuranceThreshold, 0, 100000, 'insuranceThreshold'); if (e) return NextResponse.json({ error: e }, { status: 400 });
  }
  if (weightType !== undefined && !['actual', 'volumetric', 'average'].includes(weightType)) {
    return NextResponse.json({ error: 'weightType: actual/volumetric/average' }, { status: 400 });
  }

  const updated = await prisma.pricingConfig.update({
    where: { id },
    data: {
      ...(pricePerKg !== undefined && { pricePerKg: Number(pricePerKg) }),
      ...(weightType !== undefined && { weightType }),
      ...(insuranceEnabled !== undefined && { insuranceEnabled }),
      ...(insuranceRate !== undefined && { insuranceRate: Number(insuranceRate) }),
      ...(insuranceThreshold !== undefined && { insuranceThreshold: Number(insuranceThreshold) }),
      ...(packagingEnabled !== undefined && { packagingEnabled }),
      ...(addressDeliveryPrice !== undefined && { addressDeliveryPrice: Number(addressDeliveryPrice) }),
      ...(collectionDays !== undefined && { collectionDays }),
      updatedById: user.id,
    },
  });

  return NextResponse.json(updated);
}
