import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';

/**
 * ТЗ docx 11.10.26 «Логістика/Рейси/Деталі рейсу», п.1 — локальна нумерація посилок
 * в одній ПОЇЗДЦІ («Україна-Нідерланди-Україна»): 001…N наскрізь через обидва рейси —
 * спершу посилки рейсу UA→EU (Отримувачі в Нідерландах), далі EU→UA (Відправники).
 *
 * Правила:
 *  - номер отримує КОЖНА посилка, прив'язана до рейсу поїздки — з моменту прив'язки,
 *    включно зі «Створеною» (ТЗ docx 12.10.26: «незалежно від того хто створив
 *    посилку — чи Клієнт, чи хтось з Працівників, чи прив'язка відбулась
 *    автоматично»; раніше — лише після прийняття до перевезення);
 *  - присвоєний номер незмінний: лічильник поїздки (journeys.parcel_counter) лише
 *    зростає, тож пізніше додані посилки отримують наступні номери, а старі не зсуваються;
 *  - при перенесенні посилки в інший рейс її номер лишається за рядком
 *    «Перенесена до рейсу …» (parcel_transfers), а в новій поїздці вона отримує
 *    наступний вільний номер.
 *
 * Номери присвоюються «ліниво» — при перегляді рейсу/посилки/списку для друку. Так
 * нумерація не залежить від того, яким шляхом посилку прийняли (картка, сканер,
 * масова зміна статусу, каскад рейсу).
 */
export async function ensureJourneyNumbers(journeyId: string): Promise<void> {
  const pending = await prisma.parcel.count({
    where: {
      deletedAt: null,
      journeyNumber: null,
      trip: { journeyId },
    },
  });
  if (pending === 0) return;

  await prisma.$transaction(async (tx) => {
    // Серіалізуємо паралельні перегляди однієї поїздки — інакше два запити могли б
    // видати однаковий номер.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${journeyId}))`;
    const parcels = await tx.parcel.findMany({
      where: {
        deletedAt: null,
        journeyNumber: null,
        trip: { journeyId },
      },
      select: { id: true, direction: true, createdAt: true },
    });
    if (parcels.length === 0) return;
    // Спершу UA→EU, потім EU→UA; всередині — за часом створення посилки.
    parcels.sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === 'ua_to_eu' ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const journey = await tx.journey.update({
      where: { id: journeyId },
      data: { parcelCounter: { increment: parcels.length } },
      select: { parcelCounter: true },
    });
    let next = journey.parcelCounter - parcels.length + 1;
    for (const p of parcels) {
      await tx.parcel.update({ where: { id: p.id }, data: { journeyNumber: next++ } });
    }
  });
}

/** Те саме для поїздки, до якої належить рейс (для рейсів без поїздки — нічого). */
export async function ensureJourneyNumbersForTrip(tripId: string | null | undefined): Promise<void> {
  if (!tripId) return;
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { journeyId: true } });
  if (trip?.journeyId) await ensureJourneyNumbers(trip.journeyId);
}

/**
 * ТЗ docx 12.10.26: у списках (посилки, «Мої замовлення») номер у поїздці стоїть
 * замість старого порядкового — тож перед показом добираємо номери для поїздок,
 * у яких серед відібраних посилок є ще не пронумеровані.
 */
export async function ensureJourneyNumbersWhere(where: Prisma.ParcelWhereInput): Promise<void> {
  const rows = await prisma.parcel.findMany({
    where: { AND: [where, { journeyNumber: null, trip: { journeyId: { not: null } } }] },
    select: { trip: { select: { journeyId: true } } },
    distinct: ['tripId'],
    take: 50,
  });
  const journeyIds = new Set(rows.map((r) => r.trip?.journeyId).filter((j): j is string => !!j));
  for (const j of journeyIds) await ensureJourneyNumbers(j);
}

export { formatJourneyNumber } from '@/lib/utils/journey-number';

/**
 * Єдина точка зміни рейсу посилки (перенесення, видалення з рейсу, прив'язка).
 * Якщо посилка покидає рейс — фіксуємо це в parcel_transfers разом зі старим номером
 * і скидаємо її номер (у новій поїздці вона отримає наступний). Сама зміна tripId —
 * у тій самій транзакції.
 */
export async function moveParcelToTrip(
  args: { parcelId: string; toTripId: string | null; userId: string | null; extra?: Prisma.ParcelUpdateInput },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const parcel = await tx.parcel.findUnique({
      where: { id: args.parcelId },
      select: { tripId: true, journeyNumber: true },
    });
    if (!parcel) throw new Error('PARCEL_NOT_FOUND');
    const changed = parcel.tripId !== args.toTripId;
    if (changed && parcel.tripId) {
      await tx.parcelTransfer.create({
        data: {
          parcelId: args.parcelId,
          fromTripId: parcel.tripId,
          toTripId: args.toTripId,
          journeyNumber: parcel.journeyNumber,
          createdById: args.userId,
        },
      });
    }
    await tx.parcel.update({
      where: { id: args.parcelId },
      data: {
        ...(args.extra ?? {}),
        ...(changed
          ? {
              trip: args.toTripId ? { connect: { id: args.toTripId } } : { disconnect: true },
              journeyNumber: null,
            }
          : {}),
      },
    });
  });
  // ТЗ docx 12.10.26: у новому рейсі номер — одразу з моменту прив'язки.
  if (args.toTripId) await ensureJourneyNumbersForTrip(args.toTripId);
}
