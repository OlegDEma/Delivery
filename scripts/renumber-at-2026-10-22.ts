/**
 * ТЗ docx 12.10.26 (відповідь клієнта в коментарі): номери в поїздці — діапазонами
 * (Україна→Австрія: Відень 101–200, Лінц 201–300, решта 301–400 …). Дві «Створені»
 * посилки поїздки AT 22.10.2026 отримали номери ще за старою наскрізною схемою (001, 002).
 * Скрипт перенумеровує поїздку за новою схемою — за згодою Олега 19.10.2026.
 *
 *   npx tsx --env-file=.env scripts/renumber-at-2026-10-22.ts           (dry-run — лише показує)
 *   npx tsx --env-file=.env scripts/renumber-at-2026-10-22.ts --apply   (застосувати)
 *
 * Запобіжники: поїздка — рівно одна AT із виїздом 22.10.2026; усі її посилки «Створена»
 * (етикеток ще не друкували — номер іще ніде на папері); жоден рейс поїздки не поїхав;
 * немає рядків «Перенесена до рейсу …» з номерами; при --apply стан перечитується під тим
 * самим замком, що й у ensureJourneyNumbers, і має збігатися з dry-run, інакше — стоп.
 * Перед --apply пишеться бекап «до» (JSON), кожна зміна — у журнал операцій посилки.
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/prisma';
import { parcelParties } from '../src/lib/parcels/party-snapshot';
import { assignJourneyNumbers, formatJourneyNumber, journeyNumberRangeKey, JOURNEY_NUMBER_RANGES } from '../src/lib/utils/journey-number';

const apply = process.argv.includes('--apply');
const BACKUP_DIR = 'C:/Users/olegd/Delivery-backup-2026-09-15T15-23-11/renumber-2026-10-19';

async function loadPlan() {
  const journeys = await prisma.journey.findMany({
    where: { country: 'AT', departureDate: new Date('2026-10-22') },
    include: { trips: { select: { id: true, direction: true, status: true, departureDate: true } } },
  });
  if (journeys.length !== 1) throw new Error(`Очікувалась рівно одна поїздка AT 22.10.2026, знайдено ${journeys.length}`);
  const j = journeys[0];
  const departed = j.trips.filter((t) => t.status !== 'planned');
  if (departed.length) throw new Error(`Рейси поїздки вже не «Заплановано»: ${departed.map((t) => `${t.direction}:${t.status}`).join(', ')} — зупиняюсь`);

  const parcels = await prisma.parcel.findMany({
    where: { trip: { journeyId: j.id } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, itn: true, internalNumber: true, journeyNumber: true, status: true, deletedAt: true,
      direction: true, createdAt: true, createdSource: true, senderSnapshot: true, receiverSnapshot: true,
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
      senderAddress: { select: { country: true, city: true, postalCode: true, street: true, building: true } },
      receiverAddress: { select: { country: true, city: true, postalCode: true, street: true, building: true } },
      trip: { select: { country: true } },
    },
  });
  const notDraft = parcels.filter((p) => p.status !== 'draft' || p.deletedAt);
  if (notDraft.length) throw new Error(`Є посилки не у статусі «Створена» або видалені: ${notDraft.map((p) => `${p.internalNumber}:${p.status}`).join(', ')} — зупиняюсь`);
  const ghosts = await prisma.parcelTransfer.findMany({
    where: { fromTrip: { journeyId: j.id }, journeyNumber: { not: null } },
    select: { journeyNumber: true },
  });
  if (ghosts.length) throw new Error(`У поїздці є рядки «Перенесена до рейсу …» (${ghosts.map((g) => g.journeyNumber).join(', ')}) — перенумерація зламала б їх, зупиняюсь`);

  const withKeys = parcels.map((p) => {
    const pt = parcelParties(p);
    const eu = p.direction === 'ua_to_eu' ? pt.receiver : pt.sender;
    return { p, eu, key: journeyNumberRangeKey(p.direction, p.trip?.country, eu.address) };
  });
  const assigned = assignJourneyNumbers(withKeys.map((x) => ({ id: x.p.id, key: x.key })), []);
  const rows = withKeys.map((x, i) => ({
    id: x.p.id,
    itn: x.p.itn,
    internalNumber: x.p.internalNumber,
    status: x.p.status,
    createdSource: x.p.createdSource,
    createdAt: x.p.createdAt.toISOString(),
    euCity: x.eu.address?.city ?? null,
    euPostal: x.eu.address?.postalCode ?? null,
    range: `${x.key} (${JOURNEY_NUMBER_RANGES[x.key].start}–${JOURNEY_NUMBER_RANGES[x.key].end})`,
    from: x.p.journeyNumber,
    to: assigned[i].num,
  }));
  return { journey: j, rows };
}

async function main() {
  const { journey, rows } = await loadPlan();
  console.log(`Поїздка AT ${journey.departureDate.toISOString().slice(0, 10)} (${journey.id}), рейсів: ${journey.trips.length}, усі «Заплановано».`);
  for (const r of rows) {
    console.log(`  ${formatJourneyNumber(r.from) || '—'} → ${formatJourneyNumber(r.to)}  ${r.internalNumber}  ІТН ${r.itn}  ${r.status}/${r.createdSource}  місто: ${r.euCity ?? '—'} ${r.euPostal ?? ''}  діапазон ${r.range}`);
  }
  const changes = rows.filter((r) => r.from !== r.to);
  if (!apply) {
    console.log(`\nDRY-RUN: змін буде ${changes.length}. Нічого не записано. Для застосування — --apply.`);
    return;
  }
  if (changes.length === 0) { console.log('Змін немає.'); return; }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, 'before-apply.json');
  fs.writeFileSync(backupFile, JSON.stringify({ journeyId: journey.id, takenAt: new Date().toISOString(), rows }, null, 2));
  console.log(`Бекап «до»: ${backupFile}`);

  await prisma.$transaction(async (tx) => {
    // Той самий замок, що й у ensureJourneyNumbers — паралельний перегляд рейсу не видасть номер посеред зміни.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${journey.id}))`;
    for (const r of changes) {
      const cur = await tx.parcel.findUnique({ where: { id: r.id }, select: { journeyNumber: true, status: true, tripId: true, deletedAt: true } });
      if (!cur || cur.journeyNumber !== r.from || cur.status !== 'draft' || cur.deletedAt) {
        throw new Error(`Посилка ${r.internalNumber} змінилась після dry-run (${JSON.stringify(cur)}) — відкат, нічого не змінено`);
      }
      await tx.parcel.update({ where: { id: r.id }, data: { journeyNumber: r.to } });
      await tx.auditLog.create({
        data: {
          event: 'parcel.journey_number_changed',
          subjectType: 'parcel',
          subjectId: r.id,
          payload: {
            from: formatJourneyNumber(r.from), to: formatJourneyNumber(r.to),
            reason: 'ТЗ 12.10.26: номери в поїздці діапазонами (Україна→Відень 101–200)',
          },
        },
      });
    }
  });
  console.log(`ЗАСТОСОВАНО: ${changes.map((c) => `${formatJourneyNumber(c.from)}→${formatJourneyNumber(c.to)}`).join(', ')}`);
}

main()
  .catch((e) => { console.error('ПОМИЛКА:', e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
