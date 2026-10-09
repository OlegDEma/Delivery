/**
 * ТЗ docx 08.10.26 (приклад посилки №8): «При виборі напряму Україна-Європа
 * Оголошена вартість відображається в гривнях… При нарахуванні оплати за
 * страхування оголошена вартість в гривнях переводиться в Євро згідно курсу НБУ».
 *
 * Посилки Україна→Європа, які Клієнт створив до фіксу 01–04.10.26, збережені з
 * declaredValueCurrency = 'EUR', хоча вартість вводилась у ГРИВНЯХ (форма показувала
 * «Оголошена вартість (грн)»). Через це картка посилки перераховувала страхування
 * так, ніби 1000 грн — це 1000 € (у №8 — «30,00 EUR» замість нуля).
 *
 * Що робить:
 *  - виправляє позначку валюти на 'UAH' (лише UA→EU, відправник в Україні, клієнтські,
 *    створені до 04.10.26);
 *  - ЛИШЕ для НЕОПЛАЧЕНИХ і ще не доставлених — перераховує страхування за курсом НБУ
 *    і правилом ТЗ 08.10.26 (чекбокс → завжди %, понад поріг тарифу → обов'язково) та
 *    відповідно коригує «Разом». Оплачені/доставлені суми не змінюються.
 *
 * Запуск:  npx tsx --env-file=.env scripts/fix-uah-declared-currency.ts           (dry-run)
 *          npx tsx --env-file=.env scripts/fix-uah-declared-currency.ts --apply   (застосувати)
 */
import { prisma } from '../src/lib/prisma';
import { toEur } from '../src/lib/utils/currency';

const APPLY = process.argv.includes('--apply');
const BEFORE = new Date('2026-10-04T00:00:00Z');
const DONE = ['delivered_eu', 'delivered_ua', 'in_transit_to_eu', 'at_eu_warehouse'];

async function main() {
  const parcels = await prisma.parcel.findMany({
    where: {
      deletedAt: null, direction: 'ua_to_eu', createdSource: 'client_web',
      declaredValueCurrency: 'EUR', createdAt: { lt: BEFORE },
    },
    orderBy: { sequentialNumber: 'asc' },
    select: {
      id: true, internalNumber: true, declaredValue: true, insuranceApplied: true, insuranceCost: true,
      totalCost: true, isPaid: true, status: true,
      senderAddress: { select: { country: true } },
      trip: { select: { country: true } }, receiverAddress: { select: { country: true } },
    },
  });
  const rate = await toEur(1000, 'UAH'); // EUR за 1000 грн — для показу
  console.log(`Курс НБУ зараз: 1000 грн = ${rate.toFixed(2)} €. Кандидатів: ${parcels.length}${APPLY ? '' : ' (dry-run)'}\n`);

  for (const p of parcels) {
    if (p.senderAddress?.country && p.senderAddress.country !== 'UA') {
      console.log(`${p.internalNumber}: відправник не в Україні (${p.senderAddress.country}) — пропуск`);
      continue;
    }
    const declared = Number(p.declaredValue ?? 0);
    const recalc = !p.isPaid && !DONE.includes(p.status);
    let newIns: number | null = null;
    let newTotal: number | null = null;
    if (recalc) {
      const country = (p.trip?.country !== 'UA' ? p.trip?.country : null) ?? p.receiverAddress?.country;
      const cfg = country ? await prisma.pricingConfig.findFirst({
        where: { country, direction: 'ua_to_eu', isActive: true }, orderBy: { createdAt: 'desc' },
      }) : null;
      const declaredEur = await toEur(declared, 'UAH');
      const pct = cfg ? Number(cfg.insuranceRate) * 100 : 0;
      const threshold = cfg ? Number(cfg.insuranceThreshold) : 20;
      const on = cfg?.insuranceEnabled && (p.insuranceApplied || declaredEur > threshold);
      newIns = on && declaredEur > 0 ? Math.round(declaredEur * pct) / 100 : 0;
      const oldIns = Number(p.insuranceCost ?? 0);
      newTotal = Math.round((Number(p.totalCost ?? 0) - oldIns + newIns) * 100) / 100;
    }
    console.log(
      `${p.internalNumber.padEnd(28)} ${declared} EUR→UAH` +
      (recalc ? ` | страхування ${Number(p.insuranceCost ?? 0)} → ${newIns} € | разом ${Number(p.totalCost ?? 0)} → ${newTotal} €`
              : ` | ${p.isPaid ? 'оплачена' : p.status} — суми не змінюємо`),
    );
    if (APPLY) {
      await prisma.parcel.update({
        where: { id: p.id },
        data: {
          declaredValueCurrency: 'UAH',
          ...(recalc ? { insuranceCost: newIns, totalCost: newTotal } : {}),
        },
      });
    }
  }
  if (!APPLY) console.log('\nDry-run. Для застосування — додайте --apply.');
}

main().finally(() => prisma.$disconnect());
