import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { calculateParcelCost } from '@/lib/utils/pricing';
import { parseBody, calculateCostSchema, parsePackagingPrices } from '@/lib/validators';
import { logger } from '@/lib/logger';

// POST /api/parcels/calculate — calculate parcel cost based on pricing config
// Any authenticated user can call this (including clients — they see the estimate).
export async function POST(request: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, calculateCostSchema);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed;

  // Find active pricing config
  const config = await prisma.pricingConfig.findFirst({
    where: { country: body.country, direction: body.direction, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!config) {
    logger.info('pricing.not_found', { country: body.country, direction: body.direction });
    return NextResponse.json(
      { error: `Тариф для ${body.country} у напрямку ${body.direction} не налаштовано` },
      { status: 404 }
    );
  }

  const result = calculateParcelCost(
    {
      pricePerKg: Number(config.pricePerKg),
      weightType: config.weightType,
      insuranceThreshold: Number(config.insuranceThreshold),
      insuranceRate: Number(config.insuranceRate),
      insuranceEnabled: config.insuranceEnabled,
      packagingEnabled: config.packagingEnabled,
      packagingPrices: parsePackagingPrices(config.packagingPrices),
      addressDeliveryPrice: Number(config.addressDeliveryPrice),
    },
    {
      actualWeight: body.actualWeight ?? 0,
      volumetricWeight: body.volumetricWeight ?? 0,
      declaredValue: body.declaredValue ?? 0,
      needsPackaging: body.needsPackaging ?? false,
      isAddressDelivery: body.isAddressDelivery ?? false,
    }
  );

  return NextResponse.json({
    ...result,
    pricePerKg: Number(config.pricePerKg),
    weightType: config.weightType,
  });
}
