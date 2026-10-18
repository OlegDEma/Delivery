import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import { logger } from '@/lib/logger';
import { parcelParties } from '@/lib/parcels/party-snapshot';
import { assignJourneyNumbers, journeyNumberRangeKey } from '@/lib/utils/journey-number';

/**
 * ТЗ docx 11.10.26 «Логістика/Рейси/Деталі рейсу», п.1 — локальна нумерація посилок
 * в одній ПОЇЗДЦІ (тиждень «Україна-Нідерланди-Україна»).
 *
 * ТЗ docx 12.10.26 (відповідь клієнта в коментарі до 12.10.26): замість наскрізного
 * 001…N — окремі діапазони за напрямком / країною / містом (Україна→Нідерланди 001–100,
 * Україна→Австрія: Відень 101–200, Лінц 201–300, решта 301–400; Нідерланди→Україна
 * 501–600, Австрія→Україна 601–700). Діапазони — lib/utils/journey-number.
 *
 * Правила:
 *  - номер отримує КОЖНА посилка, прив'язана до рейсу поїздки — з моменту прив'язки,
 *    включно зі «Створеною» (ТЗ docx 12.10.26);
 *  - присвоєний номер незмінний: наступна посилка діапазону отримує «найбільший уже
 *    виданий у діапазоні + 1» — з урахуванням видалених посилок і рядків «Перенесена до
 *    рейсу …», тож номери не повторюються і не зсуваються;
 *  - при перенесенні посилки в інший рейс старий номер у неї забирається (лишається
 *    лише рядком «Перенесена до рейсу …», parcel_transfers), а в новій поїздці вона
 *    отримує наступний номер свого діапазону;
 *  - якщо діапазон за тиждень вичерпано — наступний вільний після 1000, щоб посилка не
 *    лишилась без номера.
 *
 * Номери присвоюються «ліниво» — при перегляді рейсу/посилки/списку для друку і одразу
 * після створення/перенесення. Так нумерація не залежить від того, яким шляхом посилку
 * прийняли (картка, сканер, масова зміна статусу, каскад рейсу).
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
      select: {
        id: true, direction: true, createdAt: true, status: true,
        senderSnapshot: true, receiverSnapshot: true,
        senderAddress: { select: { country: true, city: true, postalCode: true } },
        receiverAddress: { select: { country: true, city: true, postalCode: true } },
        trip: { select: { country: true } },
      },
    });
    if (parcels.length === 0) return;

    // Уже видані номери поїздки: посилки (і видалені — їхні етикетки могли надрукувати)
    // та рядки «Перенесена до рейсу …» з рейсів цієї поїздки.
    const [numbered, ghosts] = await Promise.all([
      tx.parcel.findMany({
        where: { journeyNumber: { not: null }, trip: { journeyId } },
        select: { journeyNumber: true },
      }),
      tx.parcelTransfer.findMany({
        where: { journeyNumber: { not: null }, fromTrip: { journeyId } },
        select: { journeyNumber: true },
      }),
    ]);
    const used = [...numbered, ...ghosts].map((r) => r.journeyNumber as number);

    // У межах діапазону — за часом створення посилки.
    parcels.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const pendingKeys = parcels.map((p) => {
      // Для Україна→Австрія місто (Відень/Лінц/решта) — за адресою Отримувача.
      const parties = parcelParties(p);
      const euSide = p.direction === 'ua_to_eu' ? parties.receiver : parties.sender;
      return { id: p.id, key: journeyNumberRangeKey(p.direction, p.trip?.country, euSide.address) };
    });
    for (const a of assignJourneyNumbers(pendingKeys, used)) {
      if (a.overflow) {
        logger.warn('journey_numbering.range_exhausted', { journeyId, parcelId: a.id, assigned: a.num });
      }
      await tx.parcel.update({ where: { id: a.id }, data: { journeyNumber: a.num } });
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
