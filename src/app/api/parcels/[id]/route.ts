import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import type { ParcelStatus } from '@/generated/prisma/client';
import { calculateParcelCost } from '@/lib/utils/pricing';

// GET /api/parcels/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const parcel = await prisma.parcel.findFirst({
    where: { id, deletedAt: null },
    include: {
      sender: {
        include: { addresses: { orderBy: { usageCount: 'desc' } } },
      },
      senderAddress: true,
      receiver: {
        include: { addresses: { orderBy: { usageCount: 'desc' } } },
      },
      receiverAddress: true,
      places: { orderBy: { placeNumber: 'asc' } },
      statusHistory: {
        orderBy: { changedAt: 'desc' },
        include: { changedBy: { select: { fullName: true } } },
      },
      trip: { select: { id: true, departureDate: true, country: true, direction: true } },
      assignedCourier: { select: { id: true, fullName: true } },
      createdBy: { select: { fullName: true } },
    },
  });

  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  return NextResponse.json(parcel);
}

// PATCH /api/parcels/[id] — update status or fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  // Status change
  if (body.status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statusUpdateData: any = {
      status: body.status as ParcelStatus,
      statusHistory: {
        create: {
          status: body.status as ParcelStatus,
          changedById: user.id,
          notes: body.statusNote || null,
          location: body.location || null,
        },
      },
    };

    // Auto-link to nearest trip when status becomes "Прийнято до перевезення"
    const acceptedStatuses = ['accepted_for_transport_to_ua', 'accepted_for_transport_to_eu'];
    if (acceptedStatuses.includes(body.status) && !parcel.tripId) {
      const direction = body.status === 'accepted_for_transport_to_ua' ? 'eu_to_ua' : 'ua_to_eu';

      // Find receiver address to determine country (for outbound trips from EU)
      const receiverAddr = parcel.receiverAddressId
        ? await prisma.clientAddress.findUnique({ where: { id: parcel.receiverAddressId } })
        : null;
      const senderAddr = parcel.senderAddressId
        ? await prisma.clientAddress.findUnique({ where: { id: parcel.senderAddressId } })
        : null;

      // For EU→UA: country is sender's country; For UA→EU: country is receiver's country
      const targetCountry = direction === 'eu_to_ua'
        ? senderAddr?.country
        : receiverAddr?.country;

      // Find nearest planned trip with matching direction (and country if known)
      const nearestTrip = await prisma.trip.findFirst({
        where: {
          direction,
          status: 'planned',
          departureDate: { gte: new Date() },
          ...(targetCountry && targetCountry !== 'UA' ? { country: targetCountry } : {}),
        },
        orderBy: { departureDate: 'asc' },
      });

      if (nearestTrip) {
        statusUpdateData.tripId = nearestTrip.id;
        statusUpdateData.statusHistory.create.notes =
          (body.statusNote ? body.statusNote + '. ' : '') +
          `Автоматично прив'язано до рейсу ${nearestTrip.country} ${new Date(nearestTrip.departureDate).toLocaleDateString('uk-UA')}`;
      }
    }

    const updated = await prisma.parcel.update({
      where: { id },
      data: statusUpdateData,
    });
    return NextResponse.json(updated);
  }

  // General field updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};
  if (body.npTtn !== undefined) updateData.npTtn = body.npTtn;
  if (body.tripId !== undefined) updateData.tripId = body.tripId;
  if (body.assignedCourierId !== undefined) updateData.assignedCourierId = body.assignedCourierId;
  if (body.isPaid !== undefined) {
    updateData.isPaid = body.isPaid;
    if (body.isPaid) updateData.paidAt = new Date();
  }
  if (body.estimatedDeliveryStart !== undefined) updateData.estimatedDeliveryStart = body.estimatedDeliveryStart;
  if (body.estimatedDeliveryEnd !== undefined) updateData.estimatedDeliveryEnd = body.estimatedDeliveryEnd;
  if (body.shortNumber !== undefined) updateData.shortNumber = body.shortNumber;
  // Editable fields
  if (body.description !== undefined) updateData.description = body.description;
  if (body.declaredValue !== undefined) updateData.declaredValue = Number(body.declaredValue);
  if (body.needsPackaging !== undefined) updateData.needsPackaging = body.needsPackaging;
  if (body.payer !== undefined) updateData.payer = body.payer;
  if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
  if (body.paymentInUkraine !== undefined) updateData.paymentInUkraine = body.paymentInUkraine;
  if (body.shipmentType !== undefined) updateData.shipmentType = body.shipmentType;
  // Route task fields
  if (body.routeTaskStatus !== undefined) updateData.routeTaskStatus = body.routeTaskStatus || null;
  if (body.routeTaskFailReason !== undefined) updateData.routeTaskFailReason = body.routeTaskFailReason || null;
  if (body.routeTaskReschedDate !== undefined) {
    updateData.routeTaskReschedDate = body.routeTaskReschedDate ? new Date(body.routeTaskReschedDate) : null;
  }

  // Places array update — replaces dimensions/weight per place
  // Body format: { places: [{ id?, placeNumber, weight, length?, width?, height? }] }
  if (Array.isArray(body.places)) {
    let totalWeight = 0;
    let totalVolWeight = 0;

    for (const p of body.places) {
      const w = Number(p.weight) || 0;
      const l = p.length != null ? Number(p.length) : null;
      const wd = p.width != null ? Number(p.width) : null;
      const h = p.height != null ? Number(p.height) : null;
      const volW = l && wd && h ? Number(((l * wd * h) / 4000).toFixed(2)) : 0;
      totalWeight += w;
      totalVolWeight += volW;

      if (p.id) {
        await prisma.parcelPlace.update({
          where: { id: p.id },
          data: {
            weight: w,
            length: l,
            width: wd,
            height: h,
            volumetricWeight: volW || null,
            ...(p.needsPackaging !== undefined ? { needsPackaging: p.needsPackaging } : {}),
          },
        });
      }
    }

    updateData.totalWeight = totalWeight;
    updateData.totalVolumetricWeight = totalVolWeight;

    // Recalculate delivery cost using active pricing config
    try {
      // Country: for EU→UA it's the sender's, for UA→EU it's the receiver's
      const senderAddr = parcel.senderAddressId
        ? await prisma.clientAddress.findUnique({ where: { id: parcel.senderAddressId } })
        : null;
      const receiverAddr = parcel.receiverAddressId
        ? await prisma.clientAddress.findUnique({ where: { id: parcel.receiverAddressId } })
        : null;

      const country = parcel.direction === 'eu_to_ua'
        ? senderAddr?.country
        : receiverAddr?.country;

      if (country && country !== 'UA') {
        const pricing = await prisma.pricingConfig.findFirst({
          where: { direction: parcel.direction, country, isActive: true },
          orderBy: { createdAt: 'desc' },
        });

        if (pricing) {
          const isAddressDelivery = receiverAddr?.deliveryMethod === 'address';
          const breakdown = calculateParcelCost(
            {
              pricePerKg: Number(pricing.pricePerKg),
              weightType: pricing.weightType,
              insuranceThreshold: Number(pricing.insuranceThreshold),
              insuranceRate: Number(pricing.insuranceRate),
              insuranceEnabled: pricing.insuranceEnabled,
              packagingEnabled: pricing.packagingEnabled,
              packagingPrices: (pricing.packagingPrices as Record<string, number> | null) ?? null,
              addressDeliveryPrice: Number(pricing.addressDeliveryPrice),
            },
            {
              actualWeight: totalWeight,
              volumetricWeight: totalVolWeight,
              declaredValue: Number(parcel.declaredValue) || 0,
              needsPackaging: parcel.needsPackaging,
              isAddressDelivery,
            }
          );
          updateData.deliveryCost = breakdown.deliveryCost;
          updateData.insuranceCost = breakdown.insuranceCost;
          updateData.packagingCost = breakdown.packagingCost;
          updateData.addressDeliveryCost = breakdown.addressDeliveryCost;
          updateData.totalCost = breakdown.totalCost;
        }
      }
    } catch (e) {
      // Silently skip if pricing can't be calculated — user can set manually
      console.error('Cost recalc failed:', e);
    }
  }

  const updated = await prisma.parcel.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}

// DELETE /api/parcels/[id] — soft delete
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  await prisma.parcel.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
