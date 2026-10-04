/**
 * Аудит 04.10.26 — ТЗ docx 21.09.26 (п.3): «Клієнт повинен мати змогу вибрати
 * будь-яку з можливих доставок, що ІСНУЮТЬ у вибраному ним населеному пункті».
 *
 * Проблема в даних: у правилі «Міста обслуговування» для Австрії міста-винятки
 * записані з одруками, тож порівняння з назвою міста (точний збіг після
 * trim+lowercase) не спрацьовує і «Пункт видачі» не пропонується:
 *   «krems am donau» ≠ «krems an der donau»  (пункт «Кремс»)
 *   «st. pelten»     ≠ «st polten»            (пункт «Санкт Пельтен»)
 * Амстердам із цього ж класу вже виправлено 25.09.26.
 *
 * Скрипт звіряє винятки з НАЗВАМИ АКТИВНИХ ПУНКТІВ ЗБОРУ і показує, що саме
 * змінить. Нічого не видаляє. Запуск:
 *    node scripts/fix-service-cities.cjs            — лише показати (dry-run)
 *    node scripts/fix-service-cities.cjs --apply    — записати зміни
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const norm = (s) => (s || '').trim().toLowerCase();

(async () => {
  const c = new Client({ connectionString: process.env.DIRECT_URL });
  await c.connect();

  const points = (
    await c.query(
      `select country, city from collection_points where is_active = true`
    )
  ).rows;
  const byCountry = new Map();
  for (const p of points) {
    const arr = byCountry.get(p.country) ?? [];
    if (!arr.includes(norm(p.city))) arr.push(norm(p.city));
    byCountry.set(p.country, arr);
  }

  const rules = (
    await c.query(
      `select id, country, city, exceptions, accepts_pickup_point
         from service_cities
        where city = '*' and accepts_pickup_point = false`
    )
  ).rows;

  let changes = 0;
  for (const r of rules) {
    const have = (r.exceptions || []).map(norm);
    const want = byCountry.get(r.country) || [];
    const missing = want.filter((city) => !have.includes(city));
    // Винятки, які не відповідають жодному активному пункту — ймовірні одруки.
    const orphans = have.filter((city) => !want.includes(city));
    if (missing.length === 0 && orphans.length === 0) {
      console.log(`${r.country}: без змін (${have.length} винятків)`);
      continue;
    }
    const next = [...have.filter((city) => want.includes(city)), ...missing].sort();
    console.log(`\n${r.country}:`);
    console.log(`  було:  ${JSON.stringify(have)}`);
    console.log(`  стане: ${JSON.stringify(next)}`);
    if (missing.length) console.log(`  + додається (є активний пункт): ${missing.join(', ')}`);
    if (orphans.length) console.log(`  - прибирається (пункту немає): ${orphans.join(', ')}`);
    changes++;
    if (APPLY) {
      await c.query(`update service_cities set exceptions = $1, updated_at = now() where id = $2`, [
        next,
        r.id,
      ]);
      console.log('  ✔ записано');
    }
  }

  // Дублі активних пунктів — клієнт бачить кілька однакових рядків у списку.
  const dups = (
    await c.query(
      `select country, city, count(*)::int n
         from collection_points
        where is_active = true
        group by country, city
       having count(*) > 1
        order by country, city`
    )
  ).rows;
  if (dups.length) {
    console.log('\nДУБЛІ активних пунктів збору (скрипт їх НЕ чіпає — вирішує користувач):');
    console.table(dups);
  }

  console.log(
    `\n${APPLY ? 'ЗАСТОСОВАНО' : 'DRY-RUN'}: правил зі змінами — ${changes}.` +
      (APPLY ? '' : ' Щоб записати: node scripts/fix-service-cities.cjs --apply')
  );
  await c.end();
})().catch((e) => {
  console.error('ПОМИЛКА:', e.message);
  process.exit(1);
});
