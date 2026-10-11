/**
 * Прибирання тестових даних перевірки перенесення (ТЗ 09.10.26), 11.10.2026.
 *   npx tsx --env-file=.env scripts/cleanup-transfer-test-2026-10-11.ts          (dry-run — лише показує)
 *   npx tsx --env-file=.env scripts/cleanup-transfer-test-2026-10-11.ts --apply  (видалити)
 *
 * Видаляє: посилку «47 Wien» (ІТН 2430000469, опис «ТЕСТ перенесення — видалити»),
 * тестових клієнтів +380990000111 і +436600000111 (з адресами).
 * Лічильники (річний номер 47, ІТН-послідовність 46, номери поїздок AT 24.12/31.12)
 * повертаємо ЛИШЕ якщо після тесту ніхто не створив нових посилок.
 */
import { prisma } from '../src/lib/prisma';

const PARCEL_ID = '04e3478e-d589-476d-be7b-9b8cbaed7385';
const PHONES = ['+380990000111', '+436600000111'];
const TRIPS = ['db80d2b5-a5c7-4b9f-9e44-f8e779a57bd7', 'cd84680b-26d9-473e-872e-caf9ad6c0b30'];
const apply = process.argv.includes('--apply');

async function main() {
  const p = await prisma.parcel.findUnique({ where: { id: PARCEL_ID } });
  if (!p) { console.log('Тестової посилки вже немає.'); }
  else {
    if (p.itn !== '2430000469' || !p.description?.startsWith('ТЕСТ')) throw new Error('Посилка не схожа на тестову — зупиняюсь');
    console.log('Посилка:', p.internalNumber, p.itn, p.status);
  }
  const clients = await prisma.client.findMany({ where: { phone: { in: PHONES } }, include: { addresses: true } });
  for (const c of clients) {
    const other = await prisma.parcel.count({ where: { id: { not: PARCEL_ID }, OR: [{ senderId: c.id }, { receiverId: c.id }] } });
    console.log('Клієнт:', c.phone, c.lastName, c.firstName, 'адрес:', c.addresses.length, 'інших посилок:', other);
    if (other > 0) throw new Error('У тестового клієнта є інші посилки — зупиняюсь');
  }
  const year = new Date().getFullYear();
  const seq = await prisma.yearlySequence.findUnique({ where: { year } });
  const [{ last_value }] = await prisma.$queryRaw<{ last_value: bigint }[]>`SELECT last_value FROM parcel_itn_seq`;
  const newer = await prisma.parcel.count({ where: { createdAt: { gt: p?.createdAt ?? new Date() } } });
  const canResetCounters = !!p && newer === 0 && seq?.lastNumber === p.sequentialNumber && Number(last_value) === 46;
  console.log(`Лічильники: річний=${seq?.lastNumber}, ІТН=${last_value}, новіших посилок=${newer} → повертаємо: ${canResetCounters}`);
  const trips = await prisma.trip.findMany({ where: { id: { in: TRIPS } }, select: { journeyId: true } });
  const journeyIds = trips.map((t) => t.journeyId).filter((x): x is string => !!x);

  if (!apply) { console.log('\nDry-run. Для видалення додайте --apply.'); return; }

  await prisma.$transaction(async (tx) => {
    if (p) {
      await tx.parcelTransfer.deleteMany({ where: { parcelId: PARCEL_ID } });
      await tx.parcelStatusHistory.deleteMany({ where: { parcelId: PARCEL_ID } });
      await tx.parcelPlace.deleteMany({ where: { parcelId: PARCEL_ID } });
      await tx.smsLog.deleteMany({ where: { parcelId: PARCEL_ID } });
      await tx.parcel.delete({ where: { id: PARCEL_ID } });
    }
    for (const c of clients) {
      await tx.clientAddress.deleteMany({ where: { clientId: c.id } });
      await tx.client.delete({ where: { id: c.id } });
    }
    for (const j of journeyIds) {
      const numbered = await tx.parcel.count({ where: { journeyNumber: { not: null }, trip: { journeyId: j } } });
      if (numbered === 0) await tx.journey.update({ where: { id: j }, data: { parcelCounter: 0 } });
    }
    if (canResetCounters) {
      await tx.yearlySequence.update({ where: { year }, data: { lastNumber: { decrement: 1 } } });
      await tx.$executeRaw`SELECT setval('parcel_itn_seq', 45)`;
    }
  });
  console.log('Готово.');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
