import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validators/common';
import { clientParcelPatchSchema } from '@/lib/validators/parcel';
import { logger } from '@/lib/logger';
import { isNoTripForCountry } from '@/lib/parcels/nearest-trip';
import { ensureJourneyNumbersWhere } from '@/lib/services/journey-numbering';
import { parseBody, clientOrderSchema } from '@/lib/validators';
import { canonicalPhone, normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';
import { calculateVolumetricWeight, roundWeight } from '@/lib/utils/volumetric';
import { generateInternalNumber, generatePlaceITN } from '@/lib/utils/itn';
import { priceParcel, detectBothDirections } from '@/lib/services/parcel-creation';
import { findOrCreateSenderAddress, findOrCreateReceiverAddress } from '@/lib/services/client-order-addresses';
import { canClientEditOrder, CLIENT_EDIT_LOCKED_MESSAGE } from '@/lib/parcels/edit-lock';
import { writeAuditLog } from '@/lib/audit';
import { isValidNpTtn } from '@/lib/parcels/ttn-reminder';
import type { Country } from '@/generated/prisma/enums';

/**
 * GET /api/client-portal/orders/[id]
 *
 * Повертає деталі посилки для авторизованого Клієнта — лише якщо він є
 * відправником або отримувачем цієї посилки. Інакше 404 (щоб не «світити»
 * існування чужих посилок).
 *
 * Фікс багу з docx 03.06.2026: «Посилки створені клієнтом не клікабельні.
 * Не можу зайти в створену посилку з аккаунту клієнта.»
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Знаходимо Client за телефоном профілю. Клієнт не може існувати в БД,
  // якщо профіль ще не «склеєний» з Client-карткою — тоді 404.
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const client = await prisma.client.findUnique({ where: { phone: profile.phone } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ТЗ docx 12.10.26: номер у поїздці — з моменту прив'язки до рейсу.
  await ensureJourneyNumbersWhere({ id, deletedAt: null, OR: [{ senderId: client.id }, { receiverId: client.id }] });

  // Доступ лише до власних посилок (sender/receiver = поточний клієнт).
  const parcel = await prisma.parcel.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ senderId: client.id }, { receiverId: client.id }],
    },
    // ТЗ docx 12.10.26: службова примітка для списку рейсу Клієнту не віддається.
    omit: { listNote: true },
    include: {
      // addresses (лише country, 1 шт.) — fallback визначення EU-країни для
      // «Розрахунку вартості», як на staff-детальній (той самий порядок).
      sender: {
        select: {
          firstName: true, lastName: true, middleName: true, phone: true,
          addresses: { select: { country: true }, orderBy: { usageCount: 'desc' }, take: 1 },
        },
      },
      // ТЗ docx 20.10.26: по батькові — для форми «Редагувати».
      receiver: { select: { firstName: true, lastName: true, middleName: true, phone: true } },
      receiverAddress: true,
      senderAddress: true,
      places: { orderBy: { placeNumber: 'asc' } },
      statusHistory: {
        orderBy: { changedAt: 'desc' },
        // ТЗ docx 26.10.26: isNote — щоб показати нотатку окремо від зміни статусу.
        select: { status: true, changedAt: true, notes: true, isNote: true },
      },
      trip: { select: { departureDate: true, country: true } },
      // ТЗ docx 04.10.26: «Створена клієнтом/водієм/…» — потрібна лише роль автора.
      createdBy: { select: { role: true } },
      // ТЗ docx 12.07.26: підсумок Клієнта = детальна Працівника — картка
      // «Деталі» показує кур'єра, як у staff-вигляді.
      assignedCourier: { select: { id: true, fullName: true } },
      // ТЗ docx 09.07.26: підсумок Клієнта = підсумок Працівника. Показуємо
      // «Пункт збору» так само, як у staff — з індексом і годинами роботи.
      collectionPoint: {
        select: {
          name: true, city: true, address: true, country: true,
          postalCode: true, workingHours: true, workingDays: true,
        },
      },
    },
  });

  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  // ТЗ docx 04.10.26: «Повідомте оператора…» — лише коли рейсу до країни справді немає.
  const noTripForCountry = !parcel.tripId && await isNoTripForCountry(
    parcel.direction,
    parcel.senderAddress?.country ?? parcel.sender.addresses[0]?.country,
    parcel.receiverAddress?.country,
  );

  // ТЗ docx 20.10.26: кнопка «Редагувати» — лише автору замовлення і лише до «Прийнята».
  const canClientEdit = canClientEditOrder(parcel, user.id);

  return NextResponse.json({ ...parcel, noTripForCountry, canClientEdit });
}

/**
 * PUT /api/client-portal/orders/[id]
 *
 * ТЗ docx 20.10.26 (Створення посилки Клієнтом): «надати можливість Клієнту
 * редагування посилки після її створення. Це має бути кнопка „Редагувати“, яка дає
 * можливість змінювати будь-які дані посилки (прізвища та імена, адреси, розміри, вагу,
 * оголошену вартість). Ця можливість може бути реалізована Клієнтом лише до зміни
 * статусу на „Прийнята до перевезення“».
 *
 * Тіло — те саме, що й при створенні (clientOrderSchema), обробка — та сама: адреси
 * через findOrCreate*, вартість через priceParcel. Не змінюються: напрямок і країни
 * сторін (від них залежать рейс, номер у поїздці та ІТН — а ІТН за ТЗ 12.10.26 не
 * змінюється ніколи), сам Відправник (це завжди авторизований Клієнт).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  const client = await prisma.client.findUnique({ where: { phone: profile.phone } });
  if (!client) return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });

  const parcel = await prisma.parcel.findFirst({
    where: { id, deletedAt: null, OR: [{ senderId: client.id }, { receiverId: client.id }] },
    include: {
      sender: { select: { firstName: true, lastName: true, middleName: true } },
      receiver: { select: { id: true, phone: true, firstName: true, lastName: true, middleName: true } },
      senderAddress: true,
      receiverAddress: true,
      trip: { select: { country: true } },
      places: { orderBy: { placeNumber: 'asc' }, select: { weight: true, length: true, width: true, height: true } },
    },
  });
  if (!parcel) return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  // Редагує лише автор замовлення (Клієнт, що його оформив) і лише поки «Створена».
  if (!canClientEditOrder(parcel, user.id) || parcel.senderId !== client.id) {
    return NextResponse.json({ error: CLIENT_EDIT_LOCKED_MESSAGE }, { status: 409 });
  }

  // Нотатка Клієнта — поза спільною схемою (як у POST), читаємо з копії тіла.
  const raw: { clientNote?: unknown } | null = await request.clone().json().catch(() => null);
  const clientNote = typeof raw?.clientNote === 'string' && raw.clientNote.trim() ? raw.clientNote.trim() : null;
  if (clientNote && clientNote.length > 150) {
    return NextResponse.json({ error: 'Нотатка — не більше 150 знаків' }, { status: 400 });
  }

  const body = await parseBody(request, clientOrderSchema);
  if (body instanceof NextResponse) return body;

  const direction = parcel.direction;
  if (body.direction && body.direction !== direction) {
    return NextResponse.json({ error: 'Напрямок оформленого замовлення змінити не можна' }, { status: 400 });
  }
  // Країни сторін незмінні (рейс, номер у поїздці, ІТН залежать від країни в ЄС).
  const senderCountry = (parcel.senderAddress?.country ?? body.senderCountry ?? (direction === 'ua_to_eu' ? 'UA' : null)) as Country | null;
  const receiverCountry = (parcel.receiverAddress?.country ?? body.receiverCountry ?? (direction === 'eu_to_ua' ? 'UA' : null)) as Country | null;
  if ((body.senderCountry && senderCountry && body.senderCountry !== senderCountry)
    || (body.receiverCountry && receiverCountry && body.receiverCountry !== receiverCountry)) {
    return NextResponse.json(
      { error: 'Країну Відправника чи Отримувача в оформленому замовленні змінити не можна — оформіть нове замовлення' },
      { status: 400 },
    );
  }
  if (!senderCountry || !receiverCountry) {
    return NextResponse.json({ error: 'Вкажіть країну Відправника та Отримувача' }, { status: 400 });
  }
  // ТЗ docx 08.10.26: оголошена вартість — обов'язкова.
  if (!(Number(body.declaredValue) > 0)) {
    return NextResponse.json({ error: 'Вкажіть оголошену вартість посилки' }, { status: 400 });
  }
  // ТЗ docx 26.10.26 (Україна→Європа): ТТН не обовʼязковий (Клієнт вводить його після
  // відправки), але введений номер — рівно 14 цифр НП.
  if (direction === 'ua_to_eu' && body.collectionMethod === 'external_shipping'
    && body.npTtn?.trim() && !isValidNpTtn(body.npTtn)) {
    return NextResponse.json({ error: 'Номер ТТН Нової пошти — 14 цифр' }, { status: 400 });
  }
  if (!body.senderCity) {
    return NextResponse.json({ error: 'Вкажіть Ваш населений пункт у розділі «Відправник»' }, { status: 400 });
  }
  if (!body.receiverCity) {
    return NextResponse.json({ error: 'Вкажіть населений пункт Отримувача' }, { status: 400 });
  }
  if (!body.collectionMethod) {
    return NextResponse.json({ error: 'Оберіть, як Ви передасте нам посилку' }, { status: 400 });
  }
  const collectionPointId = direction === 'eu_to_ua' && body.collectionMethod === 'pickup_point'
    ? (body.collectionPointId || null) : null;
  if (collectionPointId) {
    const cp = await prisma.collectionPoint.findUnique({ where: { id: collectionPointId }, select: { id: true } });
    if (!cp) return NextResponse.json({ error: 'Пункт збору не знайдено' }, { status: 404 });
  }

  const warnings: string[] = [];
  const changed: string[] = [];

  // ── Відправник — завжди сам Клієнт: правимо ПІБ його ж картки.
  const senderNames = {
    firstName: capitalize(body.senderFirstName || parcel.sender.firstName),
    lastName: capitalize(body.senderLastName || parcel.sender.lastName),
    middleName: body.senderMiddleName ? capitalize(body.senderMiddleName) : null,
  };
  const senderRenamed = senderNames.firstName !== parcel.sender.firstName
    || senderNames.lastName !== parcel.sender.lastName
    || (senderNames.middleName ?? null) !== (parcel.sender.middleName ?? null);

  // ── Отримувач — як при створенні: за номером телефону знаходимо або створюємо картку.
  const receiverPhone = canonicalPhone(body.receiverPhone);
  if (!receiverPhone) {
    return NextResponse.json({ error: 'Невалідний номер телефону отримувача' }, { status: 400 });
  }
  const typedReceiver = {
    firstName: capitalize(body.receiverFirstName),
    lastName: capitalize(body.receiverLastName),
    middleName: body.receiverMiddleName ? capitalize(body.receiverMiddleName) : null,
  };
  let receiver = await prisma.client.findUnique({ where: { phone: receiverPhone } });
  if (!receiver) {
    receiver = await prisma.client.create({
      data: {
        phone: receiverPhone,
        phoneNormalized: normalizePhone(receiverPhone),
        ...typedReceiver,
        country: receiverCountry,
      },
    });
  }
  let receiverRename: typeof typedReceiver | null = null;
  const receiverNamesDiffer = typedReceiver.firstName !== receiver.firstName
    || typedReceiver.lastName !== receiver.lastName
    || (typedReceiver.middleName ?? null) !== (receiver.middleName ?? null);
  if (receiverNamesDiffer) {
    // Картку Отримувача Клієнт може перейменувати, лише якщо вона «його»: її не використано
    // в чужих посилках і це не зареєстрований користувач. Інакше Клієнт міг би змінити
    // ПІБ іншої людини в усій базі — тоді ПІБ лишається, а Клієнт бачить пояснення.
    const [foreignParcels, registered] = await Promise.all([
      prisma.parcel.count({
        where: {
          deletedAt: null,
          OR: [{ senderId: receiver.id }, { receiverId: receiver.id }],
          NOT: { createdById: user.id },
        },
      }),
      prisma.profile.findFirst({ where: { phone: receiver.phone }, select: { id: true } }),
    ]);
    if (foreignParcels === 0 && !registered) {
      receiverRename = typedReceiver;
    } else {
      warnings.push(
        `Отримувач з номером ${receiver.phone} уже є в нашій базі як «${receiver.lastName} ${receiver.firstName}» — ` +
        'його прізвище та імʼя може змінити лише оператор.',
      );
    }
  }

  // ── Адреси (не мутуємо спільні записи — знаходимо або створюємо).
  const courier = body.collectionMethod === 'courier_pickup';
  const senderAddressId = await findOrCreateSenderAddress(client.id, {
    country: senderCountry,
    city: body.senderCity,
    // Перевірка 22.09.26: адреса з блоку «Виклик курʼєра» — і в адресу відправника.
    // Без курʼєра лишаємо вулицю/будинок, які вже були в адресі (форма їх не показує).
    street: courier ? body.senderStreet : parcel.senderAddress?.street,
    building: courier ? body.senderBuilding : parcel.senderAddress?.building,
    landmark: courier ? body.senderLandmark : parcel.senderAddress?.landmark,
    postalCode: body.senderPostalCode,
  });
  const receiverAddressId = await findOrCreateReceiverAddress(receiver.id, {
    country: receiverCountry,
    city: body.receiverCity,
    deliveryMethod: body.receiverDeliveryMethod || 'address',
    street: body.receiverStreet,
    building: body.receiverBuilding,
    landmark: body.receiverLandmark,
    postalCode: body.receiverPostalCode,
    npWarehouseNum: body.receiverNpWarehouse,
    pickupPointText: body.receiverPickupPointText,
  });
  const receiverAddress = await prisma.clientAddress.findUniqueOrThrow({ where: { id: receiverAddressId } });

  // ── Місця — як у createParcel (об'ємна вага з Д×Ш×В).
  let totalWeight = 0;
  let totalVolWeight = 0;
  const placeBlueprints = body.places.map((p, i) => {
    const w = Number(p.weight) || 0;
    const volW = p.length && p.width && p.height
      ? calculateVolumetricWeight(Number(p.length), Number(p.width), Number(p.height))
      : 0;
    totalWeight += w;
    totalVolWeight += volW;
    return {
      placeNumber: i + 1,
      weight: roundWeight(w),
      length: p.length != null ? Number(p.length) : null,
      width: p.width != null ? Number(p.width) : null,
      height: p.height != null ? Number(p.height) : null,
      volume: null,
      volumetricWeight: volW > 0 ? roundWeight(volW) : null,
    };
  });
  totalWeight = roundWeight(totalWeight);
  totalVolWeight = roundWeight(totalVolWeight);

  // ── Вартість — тим самим розрахунком, що й при створенні.
  const declaredValueCurrency = body.declaredValueCurrency ?? parcel.declaredValueCurrency ?? 'EUR';
  const isBothDirections = await detectBothDirections({
    senderId: client.id,
    receiverId: receiver.id,
    direction,
    collectionPointId,
    senderAddressId,
  });
  const { breakdown } = await priceParcel({
    direction,
    tripCountry: parcel.trip?.country ?? null,
    collectionPointId,
    collectionMethod: body.collectionMethod,
    senderAddressCountry: senderCountry,
    receiverAddress: { country: receiverAddress.country, deliveryMethod: receiverAddress.deliveryMethod },
    receiverCity: receiverAddress.city,
    totalWeight,
    totalVolWeight,
    declaredValue: body.declaredValue ?? null,
    declaredValueCurrency,
    insurance: body.insurance === true,
    needsPackaging: body.needsPackaging ?? false,
    doorstepDelivery: body.doorstepDelivery ?? false,
    isMultiParcelPickup: false,
    parcelMoneyAmount: parcel.parcelMoneyAmount ? Number(parcel.parcelMoneyAmount) : null,
    isBothDirections,
  });

  // Що змінилось — для журналу операцій посилки (Працівник бачить, що правив Клієнт).
  if (senderRenamed) changed.push('ПІБ Відправника');
  if (receiver.id !== parcel.receiverId) changed.push('Отримувач');
  else if (receiverRename) changed.push('ПІБ Отримувача');
  if (senderAddressId !== parcel.senderAddressId) changed.push('адреса Відправника');
  if (receiverAddressId !== parcel.receiverAddressId) changed.push('адреса Отримувача');
  const placesBefore = parcel.places.map(p => [Number(p.weight), Number(p.length), Number(p.width), Number(p.height)].join('×')).join(';');
  const placesAfter = placeBlueprints.map(p => [p.weight, p.length ?? 0, p.width ?? 0, p.height ?? 0].map(Number).join('×')).join(';');
  if (placesBefore !== placesAfter) changed.push('місця (вага/розміри)');
  if (Number(parcel.declaredValue ?? 0) !== Number(body.declaredValue ?? 0)) changed.push('оголошена вартість');
  if ((parcel.collectionMethod ?? null) !== (body.collectionMethod ?? null)
    || (parcel.collectionPointId ?? null) !== collectionPointId) changed.push('спосіб передачі');
  if (parcel.insuranceApplied !== (body.insurance === true || !!breakdown?.insuranceAutoApplied)
    || parcel.needsPackaging !== (body.needsPackaging ?? false)
    || parcel.doorstepDelivery !== (body.doorstepDelivery ?? false)) changed.push('додаткові послуги');
  if ((parcel.description ?? null) !== (body.description ?? null) || parcel.shipmentType !== (body.shipmentType ?? parcel.shipmentType)) changed.push('опис відправлення');
  if ((parcel.clientNote ?? null) !== clientNote) changed.push('нотатка');
  if (parcel.payer !== (body.payer ?? parcel.payer) || parcel.paymentMethod !== (body.paymentMethod ?? parcel.paymentMethod)
    || parcel.paymentInUkraine !== (body.paymentInUkraine ?? parcel.paymentInUkraine)) changed.push('оплата');

  const receiverCity = receiverAddress.city || 'Невідомо';
  const totalPlaces = placeBlueprints.length;
  await prisma.$transaction(async (tx) => {
    if (senderRenamed) {
      await tx.client.update({ where: { id: client.id }, data: senderNames });
    }
    if (receiverRename) {
      await tx.client.update({ where: { id: receiver.id }, data: receiverRename });
    }
    // Місця перестворюємо: номер місця в ІТН містить їхню кількість («…-1/3»), тож при
    // зміні кількості змінюються всі. Посилка «Створена» — етикеток і сканів ще немає.
    await tx.parcelPlace.deleteMany({ where: { parcelId: id } });
    await tx.parcel.update({
      where: { id },
      data: {
        // Старий внутрішній номер (місто Отримувача + кількість місць) — для пошуку;
        // порядковий номер і дата лишаються ті самі.
        internalNumber: generateInternalNumber(parcel.sequentialNumber, receiverCity, 1, totalPlaces, parcel.createdAt),
        receiver: { connect: { id: receiver.id } },
        senderAddress: { connect: { id: senderAddressId } },
        receiverAddress: { connect: { id: receiverAddressId } },
        shipmentType: body.shipmentType ?? parcel.shipmentType,
        description: body.description || null,
        declaredValue: body.declaredValue ? Number(body.declaredValue) : null,
        declaredValueCurrency,
        npTtn: body.npTtn ? body.npTtn.replace(/\s/g, '') : null,
        clientNote,
        totalWeight,
        totalVolumetricWeight: totalVolWeight,
        totalPlacesCount: totalPlaces,
        payer: body.payer ?? parcel.payer,
        paymentMethod: body.paymentMethod ?? parcel.paymentMethod,
        paymentInUkraine: body.paymentInUkraine ?? parcel.paymentInUkraine,
        needsPackaging: body.needsPackaging ?? false,
        doorstepDelivery: body.doorstepDelivery ?? false,
        insuranceApplied: body.insurance === true || !!breakdown?.insuranceAutoApplied,
        deliveryCost: breakdown?.deliveryCost || null,
        packagingCost: breakdown?.packagingCost || null,
        doorstepCost: breakdown?.doorstepCost || null,
        insuranceCost: breakdown?.insuranceCost || null,
        addressDeliveryCost: breakdown?.addressDeliveryCost || null,
        pickupPointCost: breakdown?.pickupPointCost || null,
        parcelMoneyCost: breakdown?.parcelMoneyCost || null,
        totalCost: breakdown?.totalCost || null,
        collectionMethod: body.collectionMethod,
        collectionPoint: collectionPointId ? { connect: { id: collectionPointId } } : { disconnect: true },
        collectionDate: body.collectionDate ? new Date(body.collectionDate) : null,
        collectionAddress: courier ? (body.collectionAddress ?? null) : null,
        isMultiParcelPickup: courier ? false : null,
        places: {
          create: placeBlueprints.map(pb => ({
            ...pb,
            itnPlace: generatePlaceITN(parcel.itn, pb.placeNumber, totalPlaces),
            barcodeData: generatePlaceITN(parcel.itn, pb.placeNumber, totalPlaces),
          })),
        },
      },
    });
  }, { timeout: 15_000, maxWait: 5_000 });

  logger.audit('parcel.edited_by_client', { parcelId: id, userId: user.id, changed });
  await writeAuditLog({
    event: 'parcel.edited_by_client',
    actorId: user.id,
    subjectId: id,
    subjectType: 'parcel',
    payload: { змінено: changed.length ? changed.join(', ') : 'без змін' },
  });

  const updated = await prisma.parcel.findUnique({ where: { id }, select: { id: true, totalCost: true } });
  return NextResponse.json({ ...updated, warnings });
}

/**
 * PATCH /api/client-portal/orders/[id]
 *
 * ТЗ docx 03.10.26 (п.2, п.4): «Замість ІТН у Клієнта повинна бути можливість
 * додати номер ТТН (товарно-транспортної декларації) Нової пошти… Після
 * введення ТТН Клієнтом він повинен відображатись тут у Клієнта і тут у
 * будь-якого працівника».
 *
 * Клієнту дозволено змінювати ЛИШЕ `npTtn` і лише у СВОЇЙ посилці — решта
 * полів (вартість, статус, сторони) лишається за Працівником.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  const parsed = clientParcelPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Невалідний номер ТТН' }, { status: 400 });
  }

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  const client = await prisma.client.findUnique({ where: { phone: profile.phone } });
  if (!client) return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });

  const parcel = await prisma.parcel.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ senderId: client.id }, { receiverId: client.id }],
    },
    select: { id: true },
  });
  if (!parcel) return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });

  const updated = await prisma.parcel.update({
    where: { id },
    data: { npTtn: parsed.data.npTtn?.trim() || null },
    select: { id: true, npTtn: true },
  });
  logger.audit('parcel.np_ttn_updated_by_client', { parcelId: id, userId: user.id });
  return NextResponse.json(updated);
}
