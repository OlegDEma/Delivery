/**
 * ТЗ docx 30.10.26 і відповідь клієнта «НЕ ВИКОНАНО» (26.10 / 20.10) — живий тест 31.10.2026
 * створив на проді тестове замовлення Клієнта (акаунт Олега, рейс UA→AT 05.11.2026): №202 Linz
 * («Так → Поштою», ТТН 59000000003010), потім редагування (вулиця, оголошена вартість, вага,
 * нотатка, відповідь «Ви вже передали…?»), фото посилки й нотатки. Номер 202 у діапазоні Лінца
 * без очистки зсунув би наступну справжню посилку на 203. Скрипт видаляє замовлення повністю
 * (місця, історія, журнал, фото в Storage) і тестову картку Отримувача «Тестовий Перевірка»
 * +436640003010 з адресами, якщо ті ніде більше не використовуються. Картка Відправника — це
 * клієнтський акаунт Олега, її не чіпаємо (лише адресу «Харків», якщо вона більше ніде не потрібна).
 *
 *   npx tsx --env-file=.env scripts/cleanup-test-order-2026-10-31.ts           (dry-run — лише показує)
 *   npx tsx --env-file=.env scripts/cleanup-test-order-2026-10-31.ts --apply   (застосувати)
 *
 * Лічильники ІТН і річного порядкового номера не відкочуються (як і після попередніх тестів).
 */
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../src/lib/prisma';

const apply = process.argv.includes('--apply');
const TEST = { id: 'c12efa6a-d266-4018-b33e-2160877c9aef', receiverPhone: '+436640003010', note: 'ТЕСТ 31.10 — нотатка змінена' };

async function main() {
  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from('photos');
  const parcel = await prisma.parcel.findUnique({
    where: { id: TEST.id },
    select: {
      id: true, itn: true, journeyNumber: true, status: true, clientNote: true, isPaid: true,
      senderAddressId: true, receiverId: true,
      receiver: { select: { phone: true } },
      _count: { select: { places: true, statusHistory: true, cashEntries: true, routeTasks: true, warehouseActions: true } },
    },
  });
  if (!parcel) { console.log('Вже видалено.'); return; }
  if ((parcel.clientNote ?? null) !== TEST.note || parcel.receiver.phone !== TEST.receiverPhone) {
    throw new Error('Нотатка/Отримувач не збігаються з тестовими — зупиняюсь');
  }
  if (parcel.status !== 'draft' || parcel.isPaid) throw new Error(`Статус ${parcel.status}, оплачено=${parcel.isPaid} — неочікувано, зупиняюсь`);
  if (parcel._count.cashEntries || parcel._count.routeTasks || parcel._count.warehouseActions) {
    throw new Error(`Є каса/маршрут/склад (${JSON.stringify(parcel._count)}) — зупиняюсь`);
  }
  const receiverOtherParcels = await prisma.parcel.count({
    where: { id: { not: TEST.id }, OR: [{ senderId: parcel.receiverId }, { receiverId: parcel.receiverId }] },
  });
  const registered = await prisma.profile.findFirst({ where: { phone: TEST.receiverPhone }, select: { id: true } });
  const dropReceiver = receiverOtherParcels === 0 && !registered;
  const senderAddrUsed = parcel.senderAddressId
    ? await prisma.parcel.count({ where: { id: { not: TEST.id }, OR: [{ senderAddressId: parcel.senderAddressId }, { receiverAddressId: parcel.senderAddressId }] } })
    : 1;
  const { data: files } = await storage.list(`parcels/${TEST.id}`);
  const paths = (files ?? []).map((f) => `parcels/${TEST.id}/${f.name}`);

  console.log(JSON.stringify({
    itn: parcel.itn, journeyNumber: parcel.journeyNumber, status: parcel.status, counts: parcel._count,
    receiver: { phone: TEST.receiverPhone, delete: dropReceiver },
    senderAddress: { id: parcel.senderAddressId, usedElsewhere: senderAddrUsed, delete: senderAddrUsed === 0 },
    storageFiles: paths,
  }, null, 1));
  if (!apply) { console.log('dry-run: нічого не змінено. Для застосування додайте --apply'); return; }

  if (paths.length) await storage.remove(paths);
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { subjectType: 'parcel', subjectId: TEST.id } });
    await tx.parcelStatusHistory.deleteMany({ where: { parcelId: TEST.id } });
    await tx.parcelPlace.deleteMany({ where: { parcelId: TEST.id } });
    await tx.parcelTransfer.deleteMany({ where: { parcelId: TEST.id } });
    await tx.parcel.delete({ where: { id: TEST.id } });
    if (senderAddrUsed === 0 && parcel.senderAddressId) {
      await tx.clientAddress.deleteMany({ where: { id: parcel.senderAddressId } });
    }
    if (dropReceiver) {
      await tx.clientAddress.deleteMany({ where: { clientId: parcel.receiverId } });
      await tx.client.delete({ where: { id: parcel.receiverId } });
    }
  });
  console.log(`Видалено ${parcel.itn} (№${parcel.journeyNumber}). Готово.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
