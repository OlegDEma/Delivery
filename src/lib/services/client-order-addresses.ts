/**
 * Адреси сторін замовлення, яке Клієнт оформлює (або редагує) у порталі.
 * Спільне для POST /api/client-portal/orders (створення) і PUT
 * /api/client-portal/orders/[id] (ТЗ docx 20.10.26 — редагування до «Прийнята»),
 * щоб правка зберігала адреси рівно так само, як створення.
 *
 * Адреси не мутуються: знаходимо існуючий запис цього клієнта з тими самими
 * полями або створюємо новий (інші посилки на стару адресу не зачіпаються).
 */
import type { Country, DeliveryMethod } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

export interface SenderAddressInput {
  country: Country;
  city: string;
  street?: string | null;
  building?: string | null;
  landmark?: string | null;
  postalCode?: string | null;
}

/**
 * Адреса Відправника: dedupe per client by усіх полях адреси.
 * ТЗ docx 20.10.26: раніше індекс і орієнтир у ключ не входили — виправлений Клієнтом
 * індекс мовчки губився (бралась стара адреса з тими самими містом/вулицею/будинком).
 * Перевірка 22.09.26 (перші замовлення клієнта на проді): вулиця/будинок/орієнтир,
 * які клієнт вводить у блоці «Виклик курʼєра», зберігаємо і в адресі відправника —
 * так само, як робить форма Працівника.
 */
export async function findOrCreateSenderAddress(clientId: string, a: SenderAddressInput): Promise<string> {
  const street = a.street || null;
  const building = a.building || null;
  const landmark = a.landmark || null;
  const postalCode = a.postalCode || null;
  const existing = await prisma.clientAddress.findFirst({
    where: { clientId, country: a.country, city: a.city, street, building, landmark, postalCode },
  });
  if (existing) return existing.id;
  const created = await prisma.clientAddress.create({
    data: { clientId, country: a.country, city: a.city, street, building, landmark, postalCode },
  });
  return created.id;
}

export interface ReceiverAddressInput {
  country: Country;
  city: string;
  deliveryMethod: DeliveryMethod;
  street?: string | null;
  building?: string | null;
  landmark?: string | null;
  postalCode?: string | null;
  npWarehouseNum?: string | null;
  pickupPointText?: string | null;
}

/**
 * Адреса Отримувача. ТЗ docx 15.07.26 (п.2): зберігаємо у БД ЛИШЕ поля, релевантні
 * обраному способу доставки — щоб стара НП/пункт видачі не «зависали» після зміни на
 * Адресну (і навпаки). Dedupe включає спосіб + усі релевантні йому поля — щоб гейтована
 * адреса не «злилася» з записом іншого способу. ТЗ docx 20.10.26: і індекс з орієнтиром —
 * інакше виправлений Клієнтом індекс мовчки губився.
 */
export async function findOrCreateReceiverAddress(clientId: string, a: ReceiverAddressInput): Promise<string> {
  const m = a.deliveryMethod;
  const street = m === 'address' ? (a.street || null) : null;
  const building = m === 'address' ? (a.building || null) : null;
  const landmark = m === 'address' ? (a.landmark || null) : null;
  const np = m === 'np_warehouse' ? (a.npWarehouseNum || null) : null;
  const pickup = m === 'pickup_point' ? (a.pickupPointText || null) : null;
  const postalCode = a.postalCode || null;
  const existing = await prisma.clientAddress.findFirst({
    where: {
      clientId,
      country: a.country,
      city: a.city,
      deliveryMethod: m,
      street,
      building,
      landmark,
      postalCode,
      npWarehouseNum: np,
      pickupPointText: pickup,
    },
  });
  if (existing) return existing.id;
  const created = await prisma.clientAddress.create({
    data: {
      clientId,
      country: a.country,
      city: a.city,
      street,
      // ТЗ docx 20.06.26 §19: Будинок + Орієнтир Отримувача.
      building,
      landmark,
      postalCode,
      npWarehouseNum: np,
      pickupPointText: pickup,
      deliveryMethod: m,
    },
  });
  return created.id;
}
