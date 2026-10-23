/**
 * ТЗ docx 20.10.26 — живий тест «Редагувати» в кабінеті Клієнта (23.10.2026) створив на
 * проді одне тестове замовлення (нотатка «ТЕСТ Claude 23.10 — видалити»). Воно зайняло
 * номер 501 у поїздці NL (рейс NL→UA 31.10.2026) — без очистки перша справжня посилка
 * цього діапазону отримала б 502. Скрипт видаляє замовлення повністю (разом з місцями,
 * історією статусів і записами журналу) і тестову картку Отримувача з її адресами,
 * якщо вони ніде більше не використовуються.
 *
 *   npx tsx --env-file=.env scripts/cleanup-test-order-2026-10-23.ts           (dry-run — лише показує)
 *   npx tsx --env-file=.env scripts/cleanup-test-order-2026-10-23.ts --apply   (застосувати)
 *
 * Лічильники ІТН і річного порядкового номера не відкочуються (пропуск одного номера —
 * як і після попередніх тестових посилок).
 */
import { prisma } from '../src/lib/prisma';

const apply = process.argv.includes('--apply');
const PARCEL_ID = 'f888164b-8a0f-4eaa-b246-de6fbdf7f91f';
const TEST_NOTE = 'ТЕСТ Claude 23.10 — видалити';
const TEST_RECEIVER_PHONE = '+380501112299';

async function main() {
  const parcel = await prisma.parcel.findUnique({
    where: { id: PARCEL_ID },
    select: {
      id: true, itn: true, journeyNumber: true, status: true, clientNote: true, isPaid: true,
      senderId: true, senderAddressId: true, receiverId: true, receiverAddressId: true,
      _count: { select: { places: true, statusHistory: true, cashEntries: true, routeTasks: true, warehouseActions: true } },
    },
  });
  if (!parcel) { console.log('Тестового замовлення вже немає — нічого робити.'); return; }
  if (parcel.clientNote !== TEST_NOTE) throw new Error('Нотатка не збігається з тестовою — зупиняюсь');
  if (parcel.status !== 'draft' || parcel.isPaid) throw new Error(`Статус ${parcel.status}, оплачено=${parcel.isPaid} — це вже не тестова чернетка, зупиняюсь`);
  if (parcel._count.cashEntries || parcel._count.routeTasks || parcel._count.warehouseActions) {
    throw new Error(`Посилка має касу/маршрут/склад (${JSON.stringify(parcel._count)}) — зупиняюсь`);
  }

  const receiver = await prisma.client.findUnique({
    where: { id: parcel.receiverId },
    select: { id: true, phone: true, addresses: { select: { id: true } } },
  });
  const receiverOtherParcels = await prisma.parcel.count({
    where: { id: { not: PARCEL_ID }, OR: [{ senderId: parcel.receiverId }, { receiverId: parcel.receiverId }] },
  });
  const dropReceiver = receiver?.phone === TEST_RECEIVER_PHONE && receiverOtherParcels === 0;
  const auditRows = await prisma.auditLog.count({ where: { subjectType: 'parcel', subjectId: PARCEL_ID } });

  // Адреси Відправника, створені тестом, лишаються, якщо на них посилаються інші посилки.
  const senderAddrUsed = parcel.senderAddressId
    ? await prisma.parcel.count({ where: { id: { not: PARCEL_ID }, OR: [{ senderAddressId: parcel.senderAddressId }, { receiverAddressId: parcel.senderAddressId }] } })
    : 1;

  console.log({
    parcel: { itn: parcel.itn, journeyNumber: parcel.journeyNumber, places: parcel._count.places, history: parcel._count.statusHistory },
    auditRows,
    receiver: { phone: receiver?.phone, addresses: receiver?.addresses.length, otherParcels: receiverOtherParcels, delete: dropReceiver },
    senderAddress: { id: parcel.senderAddressId, usedElsewhere: senderAddrUsed, delete: senderAddrUsed === 0 },
  });
  if (!apply) { console.log('dry-run: нічого не змінено. Для застосування додайте --apply'); return; }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { subjectType: 'parcel', subjectId: PARCEL_ID } });
    await tx.parcelStatusHistory.deleteMany({ where: { parcelId: PARCEL_ID } });
    await tx.parcelPlace.deleteMany({ where: { parcelId: PARCEL_ID } });
    await tx.parcelTransfer.deleteMany({ where: { parcelId: PARCEL_ID } });
    await tx.parcel.delete({ where: { id: PARCEL_ID } });
    if (senderAddrUsed === 0 && parcel.senderAddressId) {
      await tx.clientAddress.delete({ where: { id: parcel.senderAddressId } });
    }
    if (dropReceiver && receiver) {
      await tx.clientAddress.deleteMany({ where: { clientId: receiver.id } });
      await tx.client.delete({ where: { id: receiver.id } });
    }
  });
  console.log('Готово: тестове замовлення видалено.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
