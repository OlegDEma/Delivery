/**
 * ТЗ docx 07.10.26 — перенумерація вже створених посилок на 10-значний ІТН
 * (X-XX-XXXXXX-X, контрольна цифра Луна). Рішення 08.10.26: наявні посилки
 * отримують нові ІТН; старий 14-значний зберігається в parcels.itn_legacy, щоб
 * уже надруковані QR-коди далі знаходили посилку (пошук/відстеження його читають).
 *
 * Що робить (лише для посилок, у яких ІТН ще НЕ 10-значний):
 *  - бере номер з глобального лічильника parcel_itn_seq (у порядку створення);
 *  - ЄС-країна — як при створенні: рейс → пункт збору → адреса сторони;
 *  - оновлює parcels.itn, parcels.itn_legacy і коди місць (itn_place, barcode_data).
 * Нічого не видаляє. Повторний запуск безпечний — вже перенумеровані пропускає.
 *
 * Запуск:  npx tsx --env-file=.env scripts/migrate-itn10.ts           (dry-run)
 *          npx tsx --env-file=.env scripts/migrate-itn10.ts --apply   (застосувати)
 */
import { prisma } from '../src/lib/prisma';
import { buildItn10, formatItn, generatePlaceITN, ITN_COUNTRY_CODES } from '../src/lib/utils/itn';

const APPLY = process.argv.includes('--apply');

async function main() {
  const parcels = await prisma.parcel.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, itn: true, internalNumber: true, direction: true, totalPlacesCount: true, deletedAt: true,
      trip: { select: { country: true } },
      collectionPoint: { select: { country: true } },
      senderAddress: { select: { country: true } },
      receiverAddress: { select: { country: true } },
      places: { select: { id: true, placeNumber: true } },
    },
  });
  const todo = parcels.filter((p) => !/^\d{10}$/.test(p.itn));
  console.log(`Усього посилок: ${parcels.length}; потребують нового ІТН: ${todo.length}${APPLY ? '' : ' (dry-run)'}\n`);

  for (const p of todo) {
    const euCountry =
      (p.trip?.country && p.trip.country !== 'UA' ? p.trip.country : null) ??
      (p.direction === 'eu_to_ua' && p.collectionPoint?.country !== 'UA' ? p.collectionPoint?.country : null) ??
      (p.direction === 'eu_to_ua' ? p.senderAddress?.country : p.receiverAddress?.country) ??
      null;
    const cc = euCountry && euCountry !== 'UA' ? euCountry : null;
    const flag = cc && ITN_COUNTRY_CODES[cc] ? '' : '  ⚠️ ЄС-країну не визначено → код 01';

    if (!APPLY) {
      console.log(`${p.internalNumber.padEnd(32)} ${p.itn} → (новий номер при --apply, країна ${cc ?? '—'})${p.deletedAt ? ' [видалена]' : ''}${flag}`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('parcel_itn_seq')`;
      const itn = buildItn10(p.direction, cc, Number(nextval));
      await tx.parcel.update({ where: { id: p.id }, data: { itn, itnLegacy: p.itn } });
      for (const pl of p.places) {
        const code = generatePlaceITN(itn, pl.placeNumber, p.totalPlacesCount);
        await tx.parcelPlace.update({ where: { id: pl.id }, data: { itnPlace: code, barcodeData: code } });
      }
      console.log(`${p.internalNumber.padEnd(32)} ${p.itn} → ${formatItn(itn)}${p.deletedAt ? ' [видалена]' : ''}${flag}`);
    });
  }
  if (!APPLY && todo.length) console.log('\nDry-run. Для застосування — додайте --apply.');
}

main().finally(() => prisma.$disconnect());
