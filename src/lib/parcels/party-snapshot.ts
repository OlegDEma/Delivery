import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import type { PartyAddrLike } from '@/lib/utils/address-summary';

/**
 * ТЗ docx 26.07.26 (п.1): у прийнятої посилки дані сторін НЕ мінятимуться, навіть
 * якщо пізніше відредагувати клієнта/адресу (напр. створюючи іншу посилку). Для
 * цього при першому виході з «Створена» (draft → «Прийнято до перевезення») ми
 * заморожуємо ПІБ/телефон/адресу Відправника й Отримувача у знімок на самій
 * посилці, а всі accepted+ вигляди рендеряться зі знімка (не з живих даних).
 *
 * Це — єдине джерело істини і для ЗАХОПЛЕННЯ (capture), і для РЕНДЕРУ.
 */

/** Заморожена адреса — суперсет PartyAddrLike, тож summarizePartyAddress бере як є. */
export interface SnapshotAddress {
  country: string | null; city: string | null; street: string | null;
  building: string | null; apartment: string | null; postalCode: string | null;
  landmark: string | null; npWarehouseNum: string | null; npPoshtamatNum: string | null;
  pickupPointText: string | null; deliveryMethod: string | null;
}
export interface PartySnapshot {
  firstName: string; lastName: string; middleName: string | null;
  phone: string; address: SnapshotAddress | null;
}

type LiveClient = { firstName: string; lastName: string; middleName?: string | null; phone: string };
type LiveAddr = (PartyAddrLike & { npPoshtamatNum?: string | null }) | null | undefined;

/** Побудувати знімок із живого Client + прив'язаної ClientAddress. */
export function buildPartySnapshot(client: LiveClient, address: LiveAddr): PartySnapshot {
  return {
    firstName: client.firstName, lastName: client.lastName,
    middleName: client.middleName ?? null, phone: client.phone,
    address: address ? {
      country: address.country ?? null, city: address.city ?? null,
      street: address.street ?? null, building: address.building ?? null,
      apartment: address.apartment ?? null, postalCode: address.postalCode ?? null,
      landmark: address.landmark ?? null, npWarehouseNum: address.npWarehouseNum ?? null,
      npPoshtamatNum: address.npPoshtamatNum ?? null,
      pickupPointText: address.pickupPointText ?? null,
      deliveryMethod: address.deliveryMethod ?? null,
    } : null,
  };
}

/**
 * Завантажити живі сторони посилки й зробити знімки обох (для точок захоплення:
 * PATCH-статус, accept-at-point, bulk-status). Повертає готові до запису у
 * Json-колонки senderSnapshot/receiverSnapshot.
 */
export async function snapshotParcelParties(
  db: PrismaClient | Prisma.TransactionClient,
  parcelId: string,
): Promise<{ senderSnapshot: Prisma.InputJsonValue; receiverSnapshot: Prisma.InputJsonValue }> {
  const p = await db.parcel.findUniqueOrThrow({
    where: { id: parcelId },
    select: {
      sender: { select: { firstName: true, lastName: true, middleName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, middleName: true, phone: true } },
      senderAddress: true, receiverAddress: true,
    },
  });
  // Знімок — простий JSON-об'єкт; приводимо до Prisma InputJsonValue для запису
  // у Json?-колонки (PartySnapshot не має index-signature, якої вимагає Prisma).
  return {
    senderSnapshot: buildPartySnapshot(p.sender, p.senderAddress) as unknown as Prisma.InputJsonValue,
    receiverSnapshot: buildPartySnapshot(p.receiver, p.receiverAddress) as unknown as Prisma.InputJsonValue,
  };
}

/** Безпечне читання JSON-знімка (дзеркалить parsePackagingPrices). */
function asSnapshot(raw: unknown): PartySnapshot | null {
  return raw && typeof raw === 'object' ? (raw as PartySnapshot) : null;
}

export interface ParcelPartiesInput {
  status: string;
  senderSnapshot?: unknown; receiverSnapshot?: unknown;
  sender?: LiveClient | null;
  receiver?: LiveClient | null;
  senderAddress?: PartyAddrLike | null;
  receiverAddress?: PartyAddrLike | null;
}

/**
 * РЕНДЕР-резолвер: для accepted+ (status ≠ draft і є знімок) повертає заморожені
 * дані; для «Створена» (draft) — живі. Усі місця відображення ПІБ/тел/адреси
 * мають брати сторони звідси.
 */
export function parcelParties(p: ParcelPartiesInput): { sender: PartySnapshot; receiver: PartySnapshot } {
  const frozen = p.status !== 'draft' && !!asSnapshot(p.senderSnapshot);
  if (frozen) {
    return {
      sender: asSnapshot(p.senderSnapshot) ?? liveOf(p.sender, p.senderAddress),
      receiver: asSnapshot(p.receiverSnapshot) ?? liveOf(p.receiver, p.receiverAddress),
    };
  }
  return {
    sender: liveOf(p.sender, p.senderAddress),
    receiver: liveOf(p.receiver, p.receiverAddress),
  };
}

function liveOf(c: LiveClient | null | undefined, a: PartyAddrLike | null | undefined): PartySnapshot {
  return buildPartySnapshot(
    { firstName: c?.firstName ?? '', lastName: c?.lastName ?? '', middleName: c?.middleName ?? null, phone: c?.phone ?? '' },
    a ?? null,
  );
}
