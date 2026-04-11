import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateParcelCost } from '@/lib/utils/pricing';
import { getBillableWeight } from '@/lib/utils/volumetric';

// POST /api/parcels/calculate — calculate parcel cost based on pricing config
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { direction, country, actualWeight, volumetricWeight, declaredValue, needsPackaging, isAddressDelivery } = body;

  if (!direction || !country) {
    return NextResponse.json({ error: 'Напрямок та країна обов\'язкові' }, { status: 400 });
  }

  // Find active pricing config
  const config = await prisma.pricingConfig.findFirst({
    where: { country, direction, isActive: true },
  });

  if (!config) {
    return NextResponse.json({ error: 'Тариф не знайдено для цього напрямку' }, { status: 404 });
  }

  const result = calculateParcelCost(
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
      actualWeight: actualWeight || 0,
      volumetricWeight: volumetricWeight || 0,
      declaredValue: declaredValue || 0,
      needsPackaging: needsPackaging || false,
      isAddressDelivery: isAddressDelivery || false,
    }
  );

  return NextResponse.json({
    ...result,
    pricePerKg: Number(config.pricePerKg),
    weightType: config.weightType,
  });
}
