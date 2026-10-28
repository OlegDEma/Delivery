/**
 * ТЗ docx 26.10.26 — живий тест 28.10.2026 створив на проді два тестові замовлення Клієнта
 * (рейс UA→NL 27.10.2026): №004 Utrecht («Так → Поштою», ТТН з фото, фото посилки, нотатки,
 * потім «Доставлено» — перевірка автовидалення фото) і №005 Amsterdam («Ні → Відправка
 * поштою» без ТТН). Вони зайняли номери 004 і 005 у поїздці — без очистки перша справжня
 * посилка діапазону UA→NL отримала б 006. Скрипт видаляє обидва замовлення повністю (місця,
 * історія, журнал, фото в Storage) і тестові картки Отримувачів з адресами, якщо ті ніде
 * більше не використовуються.
 *
 *   npx tsx --env-file=.env scripts/cleanup-test-orders-2026-10-28.ts           (dry-run — лише показує)
 *   npx tsx --env-file=.env scripts/cleanup-test-orders-2026-10-28.ts --apply   (застосувати)
 *
 * Лічильники ІТН і річного порядкового номера не відкочуються (як і після попередніх тестів).
 */
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../src/lib/prisma';

const apply = process.argv.includes('--apply');
const TESTS = [
  { id: '1a1e2d5d-ef2a-4570-a68c-4a35b1a19901', note: 'ТЕСТ 26.10: нотатка з форми', receiverPhone: '+31612345678', statuses: ['delivered_eu'] },
  { id: 'ce28df7c-44e6-4690-a36a-83104107b41c', note: null, receiverPhone: '+31612345679', statuses: ['draft'] },
];

async function main() {
  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from('photos');
  const plan = [];
  for (const t of TESTS) {
    const parcel = await prisma.parcel.findUnique({
      where: { id: t.id },
      select: {
        id: true, itn: true, journeyNumber: true, status: true, clientNote: true, isPaid: true,
        senderAddressId: true, receiverId: true, receiverAddressId: true,
        receiver: { select: { phone: true } },
        _count: { select: { places: true, statusHistory: true, cashEntries: true, routeTasks: true, warehouseActions: true } },
      },
    });
    if (!parcel) { console.log(`${t.id}: вже видалено`); continue; }
    if ((parcel.clientNote ?? null) !== t.note || parcel.receiver.phone !== t.receiverPhone) {
      throw new Error(`${t.id}: нотатка/Отримувач не збігаються з тестовими — зупиняюсь`);
    }
    if (!t.statuses.includes(parcel.status) || parcel.isPaid) throw new Error(`${t.id}: статус ${parcel.status}, оплачено=${parcel.isPaid} — неочікувано, зупиняюсь`);
    if (parcel._count.cashEntries || parcel._count.routeTasks || parcel._count.warehouseActions) {
      throw new Error(`${t.id}: є каса/маршрут/склад (${JSON.stringify(parcel._count)}) — зупиняюсь`);
    }
    const receiverOtherParcels = await prisma.parcel.count({
      where: { id: { notIn: TESTS.map((x) => x.id) }, OR: [{ senderId: parcel.receiverId }, { receiverId: parcel.receiverId }] },
    });
    const registered = await prisma.profile.findFirst({ where: { phone: t.receiverPhone }, select: { id: true } });
    const senderAddrUsed = parcel.senderAddressId
      ? await prisma.parcel.count({ where: { id: { notIn: TESTS.map((x) => x.id) }, OR: [{ senderAddressId: parcel.senderAddressId }, { receiverAddressId: parcel.senderAddressId }] } })
      : 1;
    const { data: files } = await storage.list(`parcels/${t.id}`);
    plan.push({ t, parcel, dropReceiver: receiverOtherParcels === 0 && !registered, senderAddrUsed, files: (files ?? []).map((f) => `parcels/${t.id}/${f.name}`) });
  }

  console.log(JSON.stringify(plan.map((p) => ({
    itn: p.parcel.itn, journeyNumber: p.parcel.journeyNumber, status: p.parcel.status, counts: p.parcel._count,
    receiver: { phone: p.t.receiverPhone, delete: p.dropReceiver },
    senderAddress: { id: p.parcel.senderAddressId, usedElsewhere: p.senderAddrUsed, delete: p.senderAddrUsed === 0 },
    storageFiles: p.files,
  })), null, 1));
  if (!apply) { console.log('dry-run: нічого не змінено. Для застосування додайте --apply'); return; }

  for (const p of plan) {
    if (p.files.length) await storage.remove(p.files);
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { subjectType: 'parcel', subjectId: p.t.id } });
      await tx.parcelStatusHistory.deleteMany({ where: { parcelId: p.t.id } });
      await tx.parcelPlace.deleteMany({ where: { parcelId: p.t.id } });
      await tx.parcelTransfer.deleteMany({ where: { parcelId: p.t.id } });
      await tx.parcel.delete({ where: { id: p.t.id } });
      // Обидва тестові замовлення мають ту саму адресу Відправника — deleteMany не падає,
      // якщо її вже видалено разом з першим.
      if (p.senderAddrUsed === 0 && p.parcel.senderAddressId) {
        await tx.clientAddress.deleteMany({ where: { id: p.parcel.senderAddressId } });
      }
      if (p.dropReceiver) {
        await tx.clientAddress.deleteMany({ where: { clientId: p.parcel.receiverId } });
        await tx.client.delete({ where: { id: p.parcel.receiverId } });
      }
    });
    console.log(`Видалено ${p.parcel.itn} (№${p.parcel.journeyNumber})`);
  }
  console.log('Готово.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
