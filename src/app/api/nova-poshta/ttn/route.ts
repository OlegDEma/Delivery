import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createTTN, getSenderCounterparty, getContactPersons } from '@/lib/nova-poshta/client';
import { prisma } from '@/lib/prisma';
import type { ParcelStatus } from '@/generated/prisma/client';

// POST /api/nova-poshta/ttn — create TTN for a parcel
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { parcelId, recipientCityRef, recipientAddressRef, serviceType } = body;

  if (!parcelId) {
    return NextResponse.json({ error: 'parcelId обов\'язковий' }, { status: 400 });
  }

  // Get parcel data
  const parcel = await prisma.parcel.findUnique({
    where: { id: parcelId },
    include: {
      sender: true,
      receiver: true,
      receiverAddress: true,
      places: { orderBy: { placeNumber: 'asc' } },
    },
  });

  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  if (parcel.npTtn) {
    return NextResponse.json({ error: 'ТТН вже створено', ttn: parcel.npTtn }, { status: 409 });
  }

  try {
    // Get sender counterparty (our company)
    const senderResult = await getSenderCounterparty();
    if (!senderResult.success || senderResult.data.length === 0) {
      return NextResponse.json({ error: 'Не знайдено контрагента-відправника в НП' }, { status: 400 });
    }
    const senderRef = senderResult.data[0].Ref;

    // Get contact person
    const contactResult = await getContactPersons(senderRef);
    if (!contactResult.success || contactResult.data.length === 0) {
      return NextResponse.json({ error: 'Не знайдено контактну особу в НП' }, { status: 400 });
    }
    const contactSenderRef = contactResult.data[0].Ref;
    const senderPhone = contactResult.data[0].Phones;

    // Determine service type
    let npServiceType: 'WarehouseWarehouse' | 'WarehouseDoors' = 'WarehouseWarehouse';
    if (serviceType) {
      npServiceType = serviceType;
    } else if (parcel.receiverAddress?.deliveryMethod === 'address') {
      npServiceType = 'WarehouseDoors';
    }

    // Prepare seat options
    const optionsSeat = parcel.places.map(p => ({
      volumetricWidth: Number(p.width) || 10,
      volumetricLength: Number(p.length) || 10,
      volumetricHeight: Number(p.height) || 10,
      weight: Number(p.weight) || 0.5,
    }));

    const result = await createTTN({
      senderRef,
      senderAddressRef: body.senderAddressRef || '',
      contactSenderRef,
      senderPhone,
      recipientCityRef: recipientCityRef || '',
      recipientAddressRef: recipientAddressRef || '',
      recipientName: `${parcel.receiver.lastName} ${parcel.receiver.firstName}`,
      recipientPhone: parcel.receiver.phone,
      weight: Number(parcel.totalWeight) || 0.5,
      volumeWeight: Number(parcel.totalVolumetricWeight) || undefined,
      seatsAmount: parcel.totalPlacesCount,
      description: parcel.description || 'Посилка',
      cost: Number(parcel.declaredValue) || 100,
      payerType: parcel.payer === 'sender' ? 'Sender' : 'Recipient',
      paymentMethod: parcel.paymentMethod === 'cash' ? 'Cash' : 'NonCash',
      serviceType: npServiceType,
      optionsSeat,
    });

    // Log the API call
    await prisma.npSyncLog.create({
      data: {
        parcelId: parcel.id,
        action: 'create_ttn',
        requestPayload: body,
        responsePayload: JSON.parse(JSON.stringify(result)),
        success: result.success,
        errorMessage: result.errors.length > 0 ? result.errors.join(', ') : null,
      },
    });

    if (!result.success) {
      return NextResponse.json({
        error: `Помилка НП: ${result.errors.join(', ')}`,
        warnings: result.warnings,
      }, { status: 400 });
    }

    const ttnData = result.data[0];
    if (ttnData) {
      // Update parcel with TTN
      await prisma.parcel.update({
        where: { id: parcelId },
        data: {
          npTtn: ttnData.IntDocNumber,
          status: 'at_nova_poshta' as ParcelStatus,
          statusHistory: {
            create: {
              status: 'at_nova_poshta' as ParcelStatus,
              changedById: user.id,
              notes: `ТТН НП створено: ${ttnData.IntDocNumber}`,
            },
          },
        },
      });

      return NextResponse.json({
        ttn: ttnData.IntDocNumber,
        ref: ttnData.Ref,
        cost: ttnData.CostOnSite,
        estimatedDelivery: ttnData.EstimatedDeliveryDate,
      });
    }

    return NextResponse.json({ error: 'Невідома помилка' }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: 'Помилка з\'єднання з API НП' }, { status: 500 });
  }
}
