import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trackDocument, trackDocuments } from '@/lib/nova-poshta/client';
import { prisma } from '@/lib/prisma';

// GET /api/nova-poshta/tracking?ttn=20450000000000
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ttn = searchParams.get('ttn');

  if (!ttn) {
    return NextResponse.json({ error: 'ТТН обов\'язковий' }, { status: 400 });
  }

  try {
    const result = await trackDocument(ttn);
    if (!result.success) {
      return NextResponse.json({ error: result.errors.join(', ') }, { status: 400 });
    }

    const info = result.data[0];
    if (info) {
      // Update NP tracking status in our DB
      const parcel = await prisma.parcel.findFirst({ where: { npTtn: ttn, deletedAt: null } });
      if (parcel) {
        await prisma.parcel.update({
          where: { id: parcel.id },
          data: { npTrackingStatus: info.Status },
        });

        // Log sync
        await prisma.npSyncLog.create({
          data: {
            parcelId: parcel.id,
            action: 'track_status',
            responsePayload: JSON.parse(JSON.stringify(info)),
            success: true,
          },
        });
      }
    }

    return NextResponse.json(result.data.map(t => ({
      number: t.Number,
      statusCode: t.StatusCode,
      status: t.Status,
      warehouseRecipient: t.WarehouseRecipient,
      cityRecipient: t.CityRecipient,
      scheduledDeliveryDate: t.ScheduledDeliveryDate,
      actualDeliveryDate: t.ActualDeliveryDate,
    })));
  } catch (error) {
    return NextResponse.json({ error: 'Помилка з\'єднання з API НП' }, { status: 500 });
  }
}

// POST /api/nova-poshta/tracking — bulk track all parcels with TTN
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get all parcels with NP TTN that are not delivered
  const parcels = await prisma.parcel.findMany({
    where: {
      deletedAt: null,
      npTtn: { not: null },
      status: { in: ['at_nova_poshta', 'at_lviv_warehouse'] },
    },
    select: { id: true, npTtn: true },
  });

  if (parcels.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const ttns = parcels.map(p => p.npTtn!);

  try {
    const result = await trackDocuments(ttns);
    if (!result.success) {
      return NextResponse.json({ error: result.errors.join(', ') }, { status: 400 });
    }

    let updated = 0;
    for (const info of result.data) {
      const parcel = parcels.find(p => p.npTtn === info.Number);
      if (parcel) {
        await prisma.parcel.update({
          where: { id: parcel.id },
          data: { npTrackingStatus: info.Status },
        });
        updated++;
      }
    }

    return NextResponse.json({ updated, total: parcels.length });
  } catch (error) {
    return NextResponse.json({ error: 'Помилка з\'єднання з API НП' }, { status: 500 });
  }
}
