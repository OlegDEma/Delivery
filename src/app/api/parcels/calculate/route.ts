import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { calculateParcelCost } from '@/lib/utils/pricing';
import { parseBody, calculateCostSchema } from '@/lib/validators';
import { buildPricingInput } from '@/lib/utils/pricing-input';
import { toEur } from '@/lib/utils/currency';
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

  const pricingInput = buildPricingInput(config);
  // Конвертуємо declaredValue в EUR (per fix — UAH-вартість не множиться
  // напряму на % страхування).
  const declaredValueEur = await toEur(
    body.declaredValue ?? 0,
    body.declaredValueCurrency || 'EUR'
  );
  const result = calculateParcelCost(
    pricingInput,
    {
      actualWeight: body.actualWeight ?? 0,
      volumetricWeight: body.volumetricWeight ?? 0,
      declaredValue: declaredValueEur,
      insurance: body.insurance ?? false,
      needsPackaging: body.needsPackaging ?? false,
      isAddressDelivery: body.isAddressDelivery ?? false,
      isPickupPoint: body.isPickupPoint ?? false,
      isCourierPickup: body.isCourierPickup ?? false,
      isMultiParcelPickup: body.isMultiParcelPickup ?? false,
      isBothDirections: body.isBothDirections ?? false,
      parcelMoneyAmount: body.parcelMoneyAmount ?? 0,
    }
  );

  return NextResponse.json({
    ...result,
    pricePerKg: pricingInput.pricePerKg,
    weightType: pricingInput.weightType,
    // Echo configured rates so the UI can render context-aware hints
    // (e.g. "Страхування: 1% від 100€ = 1€"). Optional client-side use.
    insurancePercent: pricingInput.insurancePercent,
    packagingPer10kg: pricingInput.packagingPer10kg,
    parcelMoneyPercent: pricingInput.parcelMoneyPercent,
    pickupPointPrice: pricingInput.pickupPointPrice,
  });
}
