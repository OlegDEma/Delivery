/**
 * ТЗ docx 03.11.26 / 04.11.26 — живий тест 08.11.2026: Суперадмін створив тестову посилку
 * «Україна → Європа», «Без рейсу» (ланцюжок курсору, «Доплата за НП» 12 €), потім у
 * «Редагувати» додав 3 місця (баг посилки 301) і одне видалив; рахунок відмічено як
 * надісланий у Viber. Тестові картки: Отримувач «Тест Перевірка» +436600000291 (Wien,
 * пункт видачі) і Відправник «Тест Відправник» +380500000029 (Львів, НП №5).
 * Номера в поїздці посилка не має (без рейсу). Скрипт видаляє посилку повністю (місця, історія,
 * журнал, рахунки, фото в Storage) і обидві тестові картки з адресами, якщо ті ніде більше не
 * використовуються.
 *
 *   npx tsx --env-file=.env scripts/cleanup-test-parcel-2026-11-08.ts           (dry-run — лише показує)
 *   npx tsx --env-file=.env scripts/cleanup-test-parcel-2026-11-08.ts --apply   (застосувати)
 *
 * Лічильники ІТН і річного порядкового номера не відкочуються (як і після попередніх тестів).
 */
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../src/lib/prisma';

const apply = process.argv.includes('--apply');
const PARCEL_ID = 'a96fe02e-2bc8-4780-9c52-e23d3728ef5a';
const PARCEL_ITN = '2430000956';
const TEST_CLIENTS = [
  { id: '08bbfd5a-e3f5-4db7-b6b0-c22440c34909', phone: '+380500000029', role: 'Відправник' },
  { id: '66916fbd-dd3d-4518-a265-82ebfe417c3b', phone: '+436600000291', role: 'Отримувач' },
];

async function main() {
  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from('photos');

  const parcel = await prisma.parcel.findUnique({
    where: { id: PARCEL_ID },
    select: {
      id: true, itn: true, status: true, isPaid: true, tripId: true, journeyNumber: true,
      senderId: true, receiverId: true,
      _count: {
        select: {
          places: true, statusHistory: true, transfers: true, cashEntries: true, routeTasks: true,
          createdFromTasks: true, warehouseActions: true, npSyncLogs: true, claims: true,
        },
      },
    },
  });
  if (parcel) {
    if (parcel.itn !== PARCEL_ITN) throw new Error(`ІТН ${parcel.itn} ≠ ${PARCEL_ITN} — зупиняюсь`);
    if (parcel.senderId !== TEST_CLIENTS[0].id || parcel.receiverId !== TEST_CLIENTS[1].id) {
      throw new Error('Відправник/Отримувач не тестові — зупиняюсь');
    }
    if (parcel.status !== 'draft' || parcel.isPaid || parcel.tripId || parcel.journeyNumber != null) {
      throw new Error(`Неочікуваний стан: ${JSON.stringify({ status: parcel.status, isPaid: parcel.isPaid, tripId: parcel.tripId, journeyNumber: parcel.journeyNumber })} — зупиняюсь`);
    }
    const c = parcel._count;
    if (c.cashEntries || c.routeTasks || c.createdFromTasks || c.warehouseActions || c.npSyncLogs || c.claims) {
      throw new Error(`Є каса/маршрут/склад/НП/претензії (${JSON.stringify(c)}) — зупиняюсь`);
    }
  } else {
    console.log(`${PARCEL_ID}: посилку вже видалено`);
  }

  const smsLogs = await prisma.smsLog.count({ where: { parcelId: PARCEL_ID } });
  const parcelAudit = await prisma.auditLog.count({ where: { subjectType: 'parcel', subjectId: PARCEL_ID } });
  const { data: files } = await storage.list(`parcels/${PARCEL_ID}`);
  const storageFiles = (files ?? []).map((f) => `parcels/${PARCEL_ID}/${f.name}`);

  const clients: Array<(typeof TEST_CLIENTS)[number] & {
    name: string; counts: { addresses: number; routeTasks: number; claims: number };
    otherParcels: number; registered: boolean; audit: number; delete: boolean;
  }> = [];
  for (const t of TEST_CLIENTS) {
    const client = await prisma.client.findUnique({
      where: { id: t.id },
      select: { id: true, phone: true, lastName: true, firstName: true, _count: { select: { addresses: true, routeTasks: true, claims: true } } },
    });
    if (!client) { console.log(`${t.role} ${t.phone}: картку вже видалено`); continue; }
    if (client.phone !== t.phone) throw new Error(`${t.id}: телефон ${client.phone} ≠ ${t.phone} — зупиняюсь`);
    const otherParcels = await prisma.parcel.count({
      where: { id: { not: PARCEL_ID }, OR: [{ senderId: t.id }, { receiverId: t.id }] },
    });
    const registered = await prisma.profile.findFirst({ where: { phone: t.phone }, select: { id: true } });
    const audit = await prisma.auditLog.count({ where: { subjectId: t.id } });
    const keep = otherParcels > 0 || !!registered || client._count.routeTasks > 0 || client._count.claims > 0;
    clients.push({ ...t, name: `${client.lastName} ${client.firstName}`, counts: client._count, otherParcels, registered: !!registered, audit, delete: !keep });
  }

  console.log(JSON.stringify({
    parcel: parcel ? { itn: parcel.itn, status: parcel.status, counts: parcel._count, smsLogs, audit: parcelAudit, storageFiles } : null,
    clients,
  }, null, 1));
  if (!apply) { console.log('dry-run: нічого не змінено. Для застосування додайте --apply'); return; }

  if (storageFiles.length) await storage.remove(storageFiles);
  await prisma.$transaction(async (tx) => {
    if (parcel) {
      await tx.auditLog.deleteMany({ where: { subjectType: 'parcel', subjectId: PARCEL_ID } });
      await tx.smsLog.deleteMany({ where: { parcelId: PARCEL_ID } });
      await tx.parcelStatusHistory.deleteMany({ where: { parcelId: PARCEL_ID } });
      await tx.parcelPlace.deleteMany({ where: { parcelId: PARCEL_ID } });
      await tx.parcelTransfer.deleteMany({ where: { parcelId: PARCEL_ID } });
      await tx.parcel.delete({ where: { id: PARCEL_ID } });
    }
    for (const c of clients) {
      if (!c.delete) continue;
      await tx.auditLog.deleteMany({ where: { subjectId: c.id } });
      await tx.clientAddress.deleteMany({ where: { clientId: c.id } });
      await tx.client.delete({ where: { id: c.id } });
    }
  });
  console.log(`Видалено посилку ${PARCEL_ITN}${clients.filter((c) => c.delete).map((c) => `, картку ${c.role} ${c.phone}`).join('')}.`);
  console.log('Готово.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
