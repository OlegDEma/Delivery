import { prisma } from '@/lib/prisma';
import type { Country, Direction } from '@/generated/prisma/enums';

/**
 * ТЗ docx 04.10.26: «Пам'ятаємо — посилка автоматично прив'язується до
 * найближчого наявного рейсу». Раніше прив'язка відбувалась лише при переході
 * в «Прийнято до перевезення», тож щойно створена посилка показувала
 * «Рейс: Не прив'язано». Тепер — одразу при створенні.
 *
 * Країна рейсу (trip.country) завжди зберігає EU-кінець маршруту, тому:
 *  - EU→UA — шукаємо рейс з країни Відправника;
 *  - UA→EU — рейс до країни Отримувача.
 * Беремо найближчий за датою рейс, що ще приймає посилки (заплановано / в дорозі),
 * з датою не раніше сьогодні.
 */
export async function findNearestTrip(
  direction: Direction | string,
  euCountry: Country | string | null | undefined,
): Promise<{ id: string; departureDate: Date; country: Country } | null> {
  if (!euCountry || euCountry === 'UA') return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return prisma.trip.findFirst({
    where: {
      direction: direction as Direction,
      country: euCountry as Country,
      status: { in: ['planned', 'in_progress'] },
      departureDate: { gte: startOfToday },
    },
    orderBy: { departureDate: 'asc' },
    select: { id: true, departureDate: true, country: true },
  });
}

/** EU-країна посилки для підбору рейсу (див. findNearestTrip). */
export function parcelEuCountry(
  direction: Direction | string,
  senderCountry: string | null | undefined,
  receiverCountry: string | null | undefined,
): string | null {
  return (direction === 'eu_to_ua' ? senderCountry : receiverCountry) || null;
}

/**
 * ТЗ docx 04.10.26 (рішення від 05.10.26): коли Суперадмін створює рейс, «Створені»
 * посилки, що досі без рейсу (бо до їхньої країни рейсу не було), автоматично
 * прив'язуються до найближчого рейсу. Інакше вони так і висіли б з повідомленням
 * «Повідомте оператора…». Проходимо всі такі посилки — кожна отримує свій
 * найближчий рейс (а не обов'язково щойно створений).
 */
export async function linkOrphanDraftParcels(): Promise<number> {
  const orphans = await prisma.parcel.findMany({
    where: { tripId: null, status: 'draft', deletedAt: null },
    select: {
      id: true,
      direction: true,
      sender: { select: { country: true } },
      receiver: { select: { country: true } },
      senderAddress: { select: { country: true } },
      receiverAddress: { select: { country: true } },
    },
  });
  let linked = 0;
  for (const p of orphans) {
    const euCountry = parcelEuCountry(
      p.direction,
      p.senderAddress?.country ?? p.sender?.country,
      p.receiverAddress?.country ?? p.receiver?.country,
    );
    const trip = await findNearestTrip(p.direction, euCountry);
    if (!trip) continue;
    await prisma.parcel.update({ where: { id: p.id }, data: { tripId: trip.id } });
    linked++;
  }
  return linked;
}

/**
 * ТЗ docx 04.10.26: «Якщо рейсу до цієї країни у базі немає взагалі — з'являється
 * повідомлення „Повідомте оператора…“». Для посилки без рейсу визначаємо, чи справді
 * рейсу немає: старі посилки (створені до автоприв'язки) можуть бути без рейсу,
 * хоча рейс до країни вже є, — тоді попередження було б неправдою.
 */
export async function isNoTripForCountry(
  direction: Direction | string,
  senderCountry: string | null | undefined,
  receiverCountry: string | null | undefined,
): Promise<boolean> {
  const euCountry = parcelEuCountry(direction, senderCountry, receiverCountry);
  if (!euCountry || euCountry === 'UA') return false;
  return !(await findNearestTrip(direction, euCountry));
}
