import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { canonicalPhone, normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';
import { parseBody, clientOrderSchema } from '@/lib/validators';
import { createParcel } from '@/lib/services/parcel-creation';
import { findNearestTrip, parcelEuCountry } from '@/lib/parcels/nearest-trip';
import { logger } from '@/lib/logger';
import type { Country } from '@/generated/prisma/enums';

// GET /api/client-portal/orders — get client's orders
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Find client by profile phone
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) return NextResponse.json([]);

  const client = await prisma.client.findUnique({ where: { phone: profile.phone } });
  if (!client) return NextResponse.json([]);

  const parcels = await prisma.parcel.findMany({
    where: {
      deletedAt: null,
      OR: [{ senderId: client.id }, { receiverId: client.id }],
    },
    include: {
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
      receiverAddress: { select: { country: true, city: true, street: true, building: true, postalCode: true, landmark: true, deliveryMethod: true, npWarehouseNum: true } },
      senderAddress: { select: { country: true, city: true, street: true, building: true, postalCode: true, landmark: true } },
      // ТЗ docx 04.10.26: «Створена клієнтом/водієм/…» — лише роль автора.
      createdBy: { select: { role: true } },
      statusHistory: {
        orderBy: { changedAt: 'desc' },
        take: 1,
        select: { changedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(parcels);
}

// POST /api/client-portal/orders — create order by client
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) {
    return NextResponse.json({ error: 'Профіль не знайдено' }, { status: 400 });
  }
  if (!profile.fullName || !profile.fullName.trim()) {
    return NextResponse.json(
      { error: 'Заповніть ПІБ у профілі, перш ніж створювати замовлення' },
      { status: 400 }
    );
  }

  // ТЗ docx 04.10.26 (п.3): нотатка Клієнта (до 150 знаків). Читаємо з копії
  // тіла запиту — спільна схема clientOrderSchema поле не описує і відкидає.
  // ТЗ docx 08.10.26: так само — підтвердження «вже передав посилку» (UA→EU).
  const raw: { clientNote?: unknown; handedOver?: unknown } | null = await request.clone().json().catch(() => null);
  const rawNote = raw?.clientNote;
  const handedOver = raw?.handedOver === true;
  const clientNote = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim() : null;
  if (clientNote && clientNote.length > 150) {
    return NextResponse.json({ error: 'Нотатка — не більше 150 знаків' }, { status: 400 });
  }

  const parsed = await parseBody(request, clientOrderSchema);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed;

  // Per ТЗ: client must explicitly pick direction («Виберіть напрямок» — без
  // дефолту). Reject if missing instead of silently defaulting.
  if (!body.direction) {
    return NextResponse.json({ error: 'Виберіть напрямок' }, { status: 400 });
  }

  // ТЗ docx 08.10.26: «При створенні посилки Клієнт повинен ввести оголошену вартість».
  if (!(Number(body.declaredValue) > 0)) {
    return NextResponse.json({ error: 'Вкажіть оголошену вартість посилки' }, { status: 400 });
  }

  // ТЗ docx 08.10.26 — лише Україна→Європа: «Спочатку факт передачі нам посилки,
  // потім створення посилки в застосунку». Без підтвердження передачі не створюємо;
  // для «Пошти» номер ТТН (14 цифр НП) обов'язковий.
  if (body.direction === 'ua_to_eu') {
    if (!handedOver) {
      return NextResponse.json(
        { error: 'Спочатку передайте посилку «Посилочці», а потім оформіть замовлення' },
        { status: 400 },
      );
    }
    if (body.collectionMethod === 'external_shipping' && !/^\d{14}$/.test((body.npTtn ?? '').replace(/\s/g, ''))) {
      return NextResponse.json({ error: 'Введіть номер ТТН Нової пошти — 14 цифр' }, { status: 400 });
    }
  }

  // SECURITY: Sender must always be the authenticated client themselves.
  // Ignore any senderPhone in the body to prevent spoofing.
  let sender = await prisma.client.findUnique({
    where: { phone: profile.phone },
  });
  if (!sender) {
    const profileNameParts = profile.fullName.split(/\s+/).filter(Boolean);
    sender = await prisma.client.create({
      data: {
        phone: profile.phone,
        phoneNormalized: normalizePhone(profile.phone),
        firstName: capitalize(body.senderFirstName || profileNameParts[1] || profileNameParts[0] || 'Клієнт'),
        lastName: capitalize(body.senderLastName || profileNameParts[0] || 'Клієнт'),
        middleName: body.senderMiddleName ? capitalize(body.senderMiddleName) : null,
        country: (body.senderCountry ?? null) as Country | null,
      },
    });
  }

  // Sender address: dedupe per client by (country, city, street, building).
  // Перевірка 22.09.26 (перші замовлення клієнта на проді): вулиця/будинок/орієнтир,
  // які клієнт вводить у блоці «Виклик курʼєра», раніше потрапляли ЛИШЕ у текстове
  // поле collectionAddress — картка посилки і Маршрутний лист (беруть адресу
  // відправника з client_addresses) показували місто без вулиці. Тепер ці поля
  // зберігаємо і в адресі відправника — так само, як робить форма Працівника.
  let senderAddressId: string | null = null;
  if (body.senderCity) {
    const senderCountry = (body.senderCountry ?? 'UA') as Country;
    const sStreet = body.senderStreet || null;
    const sBuilding = body.senderBuilding || null;
    const existingSenderAddr = await prisma.clientAddress.findFirst({
      where: {
        clientId: sender.id,
        country: senderCountry,
        city: body.senderCity,
        street: sStreet,
        building: sBuilding,
      },
    });
    if (existingSenderAddr) {
      senderAddressId = existingSenderAddr.id;
    } else {
      const addr = await prisma.clientAddress.create({
        data: {
          clientId: sender.id,
          country: senderCountry,
          city: body.senderCity,
          street: sStreet,
          building: sBuilding,
          landmark: body.senderLandmark || null,
          postalCode: body.senderPostalCode || null,
        },
      });
      senderAddressId = addr.id;
    }
  }

  // Find or create receiver — normalize the phone first so "+38 050…" and
  // "+380 50…" resolve to the same client.
  const canonicalReceiverPhone = canonicalPhone(body.receiverPhone);
  if (!canonicalReceiverPhone) {
    return NextResponse.json({ error: 'Невалідний номер телефону отримувача' }, { status: 400 });
  }
  let receiver = await prisma.client.findUnique({ where: { phone: canonicalReceiverPhone } });
  if (!receiver) {
    receiver = await prisma.client.create({
      data: {
        phone: canonicalReceiverPhone,
        phoneNormalized: normalizePhone(canonicalReceiverPhone),
        firstName: capitalize(body.receiverFirstName),
        lastName: capitalize(body.receiverLastName),
        middleName: body.receiverMiddleName ? capitalize(body.receiverMiddleName) : null,
        country: (body.receiverCountry ?? null) as Country | null,
      },
    });
  }

  // Receiver address: same dedupe strategy.
  let receiverAddressId: string | null = null;
  if (body.receiverCity) {
    const receiverCountry = (body.receiverCountry ?? 'UA') as Country;
    const rMethod = body.receiverDeliveryMethod || 'address';
    // ТЗ docx 15.07.26 (п.2): зберігаємо у БД ЛИШЕ поля, релевантні обраному
    // способу доставки — щоб стара НП/пункт видачі не «зависали» після зміни на
    // Адресну (і навпаки). Дзеркалить staff-шлях (parcel-party-edit addAddress),
    // тож у сховищі немає нерелевантних «хвостів», а не лише у підсумку.
    const rStreet = rMethod === 'address' ? (body.receiverStreet || null) : null;
    const rBuilding = rMethod === 'address' ? (body.receiverBuilding || null) : null;
    const rLandmark = rMethod === 'address' ? (body.receiverLandmark || null) : null;
    const rNp = rMethod === 'np_warehouse' ? (body.receiverNpWarehouse || null) : null;
    const rPickup = rMethod === 'pickup_point' ? (body.receiverPickupPointText || null) : null;
    // Dedupe включає спосіб + усі релевантні йому поля — щоб гейтована адреса
    // не «злилася» з записом іншого способу (напр. pickup_point зі street=null,
    // np=null не збігся з іншим pickup_point, що має інший текст пункту).
    const existingReceiverAddr = await prisma.clientAddress.findFirst({
      where: {
        clientId: receiver.id,
        country: receiverCountry,
        city: body.receiverCity,
        deliveryMethod: rMethod,
        street: rStreet,
        building: rBuilding,
        npWarehouseNum: rNp,
        pickupPointText: rPickup,
      },
    });
    if (existingReceiverAddr) {
      receiverAddressId = existingReceiverAddr.id;
    } else {
      const addr = await prisma.clientAddress.create({
        data: {
          clientId: receiver.id,
          country: receiverCountry,
          city: body.receiverCity,
          street: rStreet,
          // ТЗ docx 20.06.26 §19: Будинок + Орієнтир Отримувача.
          building: rBuilding,
          landmark: rLandmark,
          postalCode: body.receiverPostalCode || null,
          npWarehouseNum: rNp,
          pickupPointText: rPickup,
          deliveryMethod: rMethod,
        },
      });
      receiverAddressId = addr.id;
    }
  }

  // ТЗ docx 04.10.26: посилка, створена Клієнтом, одразу прив'язується до
  // найближчого наявного рейсу (раніше — лише при «Прийнято до перевезення»).
  // Якщо рейсу до країни немає — лишається без рейсу, а картка посилки показує
  // «Повідомте оператора про відсутність рейсу…».
  const direction = body.direction ?? 'eu_to_ua';
  const nearestTrip = await findNearestTrip(
    direction,
    parcelEuCountry(direction, body.senderCountry, body.receiverCountry),
  );

  try {
    const created = await createParcel({
      senderId: sender.id,
      senderAddressId,
      receiverId: receiver.id,
      receiverAddressId,
      tripId: nearestTrip?.id ?? null,
      direction: body.direction ?? 'eu_to_ua',
      shipmentType: body.shipmentType,
      description: body.description ?? null,
      declaredValue: body.declaredValue ?? null,
      // Аудит 01.10.26: валюта оголошеної вартості — як у формі Працівника
      // (UA→EU: відправник в Україні → гривня). Без цього toEur() не конвертує.
      declaredValueCurrency:
        body.declaredValueCurrency ?? (body.direction === 'ua_to_eu' ? 'UAH' : 'EUR'),
      // Per ТЗ: opt-in послуги. Тариф для напрямку визначає % і суми.
      insurance: body.insurance ?? false,
      needsPackaging: body.needsPackaging ?? false,
      doorstepDelivery: body.doorstepDelivery ?? false,
      parcelMoneyAmount: body.parcelMoneyAmount ?? null,
      payer: body.payer,
      paymentMethod: body.paymentMethod,
      paymentInUkraine: body.paymentInUkraine,
      places: body.places,
      createdById: user.id,
      createdSource: 'client_web',
      status: 'draft',
      statusNote: 'Створено клієнтом на сайті',
      collectionMethod: body.collectionMethod ?? null,
      collectionPointId: body.collectionPointId ?? null,
      collectionDate: body.collectionDate ? new Date(body.collectionDate) : null,
      collectionAddress: body.collectionAddress ?? null,
      // ТЗ docx 03.10.26 (п.2): ТТН Нової пошти від Клієнта.
      npTtn: body.npTtn ? body.npTtn.replace(/\s/g, '') : null,
    });

    if (clientNote) {
      await prisma.parcel.update({ where: { id: created.id }, data: { clientNote } });
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.startsWith('TRIP_NOT_ACCEPTING:')) {
      const tripStatus = msg.split(':')[1];
      const label = tripStatus === 'completed' ? 'завершено' : 'скасовано';
      return NextResponse.json({ error: `Рейс уже ${label} — нові посилки додавати не можна.` }, { status: 409 });
    }
    const fkErrors: Record<string, string> = {
      SENDER_NOT_FOUND: 'Відправника не знайдено',
      RECEIVER_NOT_FOUND: 'Отримувача не знайдено',
      SENDER_ADDRESS_NOT_FOUND: 'Адресу відправника не знайдено',
      RECEIVER_ADDRESS_NOT_FOUND: 'Адресу отримувача не знайдено',
      TRIP_NOT_FOUND: 'Рейс не знайдено',
      COLLECTION_POINT_NOT_FOUND: 'Пункт збору не знайдено',
    };
    if (fkErrors[msg]) return NextResponse.json({ error: fkErrors[msg] }, { status: 404 });
    logger.error('client_portal.order.create_failed', err, { userId: user.id });
    return NextResponse.json(
      { error: 'Не вдалося створити замовлення. Спробуйте ще раз.' },
      { status: 500 }
    );
  }
}
