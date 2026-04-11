import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

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

  const body = await request.json();
  const { id, pricePerKg, weightType, insuranceEnabled, packagingEnabled, addressDeliveryPrice, collectionDays } = body;

  if (!id) return NextResponse.json({ error: 'ID обов\'язковий' }, { status: 400 });

  const updated = await prisma.pricingConfig.update({
    where: { id },
    data: {
      ...(pricePerKg !== undefined && { pricePerKg: Number(pricePerKg) }),
      ...(weightType !== undefined && { weightType }),
      ...(insuranceEnabled !== undefined && { insuranceEnabled }),
      ...(packagingEnabled !== undefined && { packagingEnabled }),
      ...(addressDeliveryPrice !== undefined && { addressDeliveryPrice: Number(addressDeliveryPrice) }),
      ...(collectionDays !== undefined && { collectionDays }),
      updatedById: user.id,
    },
  });

  return NextResponse.json(updated);
}
