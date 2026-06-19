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
        status: { notIn: [newParcelStatus, 'delivered_ua', 'delivered_eu', 'not_received', 'refused', 'returned'] },
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
 *  - «В дорозі» → «Завершено» після 23:59 дати прибуття.
 * Ручні статуси (будь-який) не чіпаємо — авто рухає лише planned/in_progress.
 * Викликається ліниво при читанні списків рейсів/поїздок (cron немає).
 */
export async function autoAdvanceTrips(): Promise<void> {
  const now = new Date();
  // Початок сьогоднішнього дня — для порівняння «дата прибуття вже минула».
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // planned → in_progress: дата виїзду настала (departureDate <= зараз).
  const toStart = await prisma.trip.findMany({
    where: { status: 'planned', departureDate: { lte: now } },
    select: { id: true },
  });
  for (const t of toStart) {
    await prisma.trip.update({ where: { id: t.id }, data: { status: 'in_progress' } });
    await applyTripStatusCascade(t.id, 'in_progress', null, 'Авто: рейс розпочав рух (за датою виїзду)');
  }

  // in_progress → completed: день прибуття повністю минув (arrivalDate < сьогодні).
  const toComplete = await prisma.trip.findMany({
    where: { status: 'in_progress', arrivalDate: { not: null, lt: todayStart } },
    select: { id: true },
  });
  for (const t of toComplete) {
    await prisma.trip.update({ where: { id: t.id }, data: { status: 'completed' } });
    await applyTripStatusCascade(t.id, 'completed', null, 'Авто: рейс завершено (за датою прибуття)');
  }
}
