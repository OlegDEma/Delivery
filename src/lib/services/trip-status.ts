import { prisma } from '@/lib/prisma';
import type { ParcelStatus, TripStatus } from '@/generated/prisma/client';

/**
 * Каскад статусу рейсу на дочірні посилки. Спільна логіка для ручної зміни
 * (PATCH /api/trips/[id]) та авто-переходу за датою (ТЗ docx 14.05.26 L3e).
 *
 * `userId` = null для системних (автоматичних) змін.
 */
export async function applyTripStatusCascade(
  tripId: string,
  newStatus: TripStatus,
  userId: string | null,
  note: string,
): Promise<void> {
  // Рейс розпочав рух → посилки «в дорозі».
  if (newStatus === 'in_progress') {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { direction: true } });
    if (!trip) return;
    const newParcelStatus: ParcelStatus =
      trip.direction === 'eu_to_ua' ? 'in_transit_to_ua' : 'in_transit_to_eu';
    const parcels = await prisma.parcel.findMany({
      where: {
        tripId,
        // ТЗ docx 26.07.26: НЕ чіпаємо «Створена» (draft) — непринята посилка не
        // має авто-заморожуватись у «в дорозі» при старті рейсу; її спершу треба
        // явно «Прийняти до перевезення».
        status: { notIn: [newParcelStatus, 'draft', 'delivered_ua', 'delivered_eu', 'not_received', 'refused', 'returned'] },
      },
      select: { id: true, collectedAt: true, collectionMethod: true, direction: true },
    });
    for (const p of parcels) {
      // EU→UA посилки без проходження пункту збору — фіксуємо collectedAt.
      const shouldStampCollected = p.direction === 'eu_to_ua' && !p.collectedAt && !!p.collectionMethod;
      await prisma.parcel.update({
        where: { id: p.id },
        data: {
          status: newParcelStatus,
          ...(shouldStampCollected ? { collectedAt: new Date(), ...(userId ? { collectedById: userId } : {}) } : {}),
          statusHistory: { create: { status: newParcelStatus, changedById: userId, notes: note } },
        },
      });
    }
  }

  // Рейс завершено (EU→UA) → посилки на складі у Львові.
  if (newStatus === 'completed') {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { direction: true } });
    if (trip && trip.direction === 'eu_to_ua') {
      const parcels = await prisma.parcel.findMany({
        where: { tripId, status: 'in_transit_to_ua' },
        select: { id: true },
      });
      for (const p of parcels) {
        await prisma.parcel.update({
          where: { id: p.id },
          data: {
            status: 'at_lviv_warehouse',
            statusHistory: { create: { status: 'at_lviv_warehouse', changedById: userId, notes: note } },
          },
        });
      }
    }
  }
}

/**
 * ТЗ docx 14.05.26 L3e: авто-перехід статусів рейсів за датою.
 *  - «Заплановано» → «В дорозі» після настання дати виїзду.
 *  - «В дорозі» → «Завершено» — БІЛЬШЕ НЕ автоматично (див. нижче).
 * Ручні статуси (будь-який) не чіпаємо — авто рухає лише planned.
 *
 * ТЗ docx 03.11.26 (п.3): завершений рейс тепер ПОВНІСТЮ заблоковано (посилки, оплати,
 * пасажири, водії, транспорт). Авто-завершення наступного дня після дати прибуття
 * блокувало б водіїв, які ще розвозять посилки й приймають оплату (рейс UA→AT з
 * прибуттям 05.11 ставав «Завершено» вже 06.11). Рішення (08.11.26): «Завершено»
 * ставить лише Суперадмін вручну, коли рейс справді закрито.
 * Викликається ліниво при читанні списків рейсів/поїздок (cron немає).
 */
export async function autoAdvanceTrips(): Promise<void> {
  const now = new Date();

  // planned → in_progress: дата виїзду настала (departureDate <= зараз).
  const toStart = await prisma.trip.findMany({
    where: { status: 'planned', departureDate: { lte: now } },
    select: { id: true },
  });
  for (const t of toStart) {
    await prisma.trip.update({ where: { id: t.id }, data: { status: 'in_progress' } });
    await applyTripStatusCascade(t.id, 'in_progress', null, 'Авто: рейс розпочав рух (за датою виїзду)');
  }

  // in_progress → completed: вручну Суперадміном (ТЗ docx 03.11.26 п.3, див. вище).
}
