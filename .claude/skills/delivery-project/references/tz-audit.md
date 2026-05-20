# ТЗ Audit — detailed, code-verified

Source: `C:\Users\olegd\Downloads\Загальна схема програми (2).xlsx`. Rows numbered E3…E61.

**v1 vs v2:** `(1).xlsx` and `(2).xlsx` are CONTENT-IDENTICAL. The client did not re-mark anything. The only green cell in both is `D3` («Загальна сторінка» — a section header, not a feature). Columns F7/F9 carry explicit `Не зроблено`, F12 `Чекаємо на Тарифи`.

**What that means:** From the **client's** point of view, NOTHING below is validated as done. The `🟢` marks in this file are MY (Claude's) code-level reading — they mean «the code path exists», NOT «the client accepted it». When reporting to the user, never say «done» based on a `🟢`. Say «реалізовано в коді, не підтверджено клієнтом».

Legend:
- 🟢 implemented in code, builds, NOT user-verified
- 🟡 partially implemented — sub-items listed
- ❌ not implemented
- 📝 code exists, but needs data/settings configured in `/admin/*`

This audit was code-verified on 2026-05-19 (grep + file reads). Earlier versions of this file had false ❌/✅ — trust this one, but re-verify before claiming.

---

## §E3 — Список посилок (загальна сторінка)

| Item | State | Evidence |
|---|---|---|
| Фільтр по кур'єру який приймав | 🟢 | `parcels/page.tsx` — `acceptedById` ⇄ `parcel.collectedById`; default `COURIER_UNASSIGNED` |
| «Розгорнутий список забрати, лише не-прив'язані» | 🟡 | default filter is unassigned; «Всі посилки» option still selectable. Ambiguous — confirm with user if «Всі» should be deleted |
| Кнопка «Очистити» дати в мобільній | 🟢 | `parcels/page.tsx:295` — inline clear button on date filter |
| Підсвічення активних фільтрів | 🟢 | `activeCls` / `isDateActive` highlight logic |

## §E4 — Тіло посилки (детальна сторінка)

| Item | State | Evidence |
|---|---|---|
| «Місця → Редагувати → повна форма» | ❌ | `ParcelPlacesCard` does inline edit, not the rich `parcels/new`-style form re-open |
| «Загальна вага» прибрати | 🟢 | removed (commit 83cf920) |
| Голубе поле «Розрахунок вартості» — структура (факт/об'ємна/розрахункова рядки) | ❌ | `cost-calculator.tsx` shows billableWeight + delivery + services. Does NOT show factual & volumetric as separate rows |
| Вкладка «Деталі» без змін | 🟢 | left alone |
| Вкладка «Оплата» — лише «До оплати» + сума | ❌ | `ParcelPaymentCard` still has full breakdown + history + payment dialog |
| «Друк етикетки» / «Повторити» / «Поділитись» | 🟢 | all three exist |
| «Поділитись» → Gmail/WhatsApp/Viber з контактом отримувача | 🟢 | `src/components/shared/share-button.tsx` — wa.me, viber://, mailto, navigator.share |
| Відправник/Отримувач — зменшити поля | 🟡 | density not specifically reduced; verify visually |
| Після прийняття — лише Суперадмін редагує вагу | 🟢 | `isEditLocked` logic in detail page |
| «Спосіб прийому» прибрати з detail | 🟢 | removed (commit 83cf920) |
| «Рейс Європа → Україна» → лише дата | ❌ | trip block still shows direction label |
| «Нова Пошта» окремий блок прибрати, ТТН вверху | 🟢 | ITN+TTN in header (`page.tsx:284`), no separate NP card |
| «Додати фото» → кнопка | 🟢 | `page.tsx:599` icon-button |
| Камера на смартфоні | 🟢 | `<input capture="environment">` (`page.tsx:608`) |
| «Додати нотатку» → кнопка | 🟢 | `page.tsx:633` button + `window.prompt` |
| Нотатка на видному місці | 🟢 | `page.tsx:372` — latest note shown in yellow banner at top |
| «Вікно доставки (4 год)» прибрати | 🟢 | removed earlier |
| Доставлено → статус не змінюється | 🟡 | `STATUS_TRANSITIONS`: `delivered_ua: []`, `delivered_eu: []` (no exits). BUT super-admin can force any transition — ТЗ says «навіть програма не може». Verify super-admin path is also blocked for terminal. |

## §E5 — Список: «Кому → Куди → Від → Звідки»

| Item | State |
|---|---|
| «Спочатку Кому:, потім Від:» | 🟢 done (commit 7114cfe) |
| List card labels «Куди:» / «Звідки:» as explicit lines | 🟡 — verify `/parcels` list renders the 4 distinct labels exactly |

## §E6 — Нова посилка: напрямок-default

🟢 `parcels/new/page.tsx:137` — direction read from `localStorage.parcel:lastDirection`, persisted on change.

## §E7 — Вкладка «Отримувач» — MAJOR REFACTOR

❌ Not started. ТЗ wants:
- «Спосіб доставки» selector → 3 options («Адресна доставка» / «Пошта» / «Пункт видачі»)
- Голубе підсумкове поле after fill; «Редагувати» button replacing «×»
- «Пошук отримувача» label removed once filled

🟢 Автокомпліт міста (Am → Amsterdam) — `AddressInput` works (commits bb3cad1, f63e35d).

❌ **BUG, F7 explicitly «Не зроблено»**: editing ONLY the phone of an existing client → «Клієнт з таким номером вже існує». In `/api/clients/[id]/route.ts` the P2002 handler fires because the phone collides with the client's OWN row. Fix: exclude current client `id` from the uniqueness check.

## §E8 — Вкладка «Новий клієнт» — MAJOR REFACTOR

❌ Not started. ТЗ wants:
- «Метод доставки» → «Адреса» with 3 sub-options, «Пункт збору» new option
- Index field before «Населений пункт»
- Country dropdown depends on direction
- **Phone split into country-code + number**, with flag icons. Codes: +43 AT, +31 NL, +380 UA, +49 DE. (`PhoneInput` component exists but does NOT split into two fields.)

## §E9 — Вкладка «Відправник» — MAJOR REFACTOR

❌ Not started (F9 explicitly «Не зроблено»). Like §E7 but «Спосіб відправки» with «Виклик кур'єра» / «Пошта» / «Пункт збору».

🟢 Multi-parcel question on courier_pickup — done (commit c584de5).
🟢 «Адресна доставка» → «Адреса відправки» for sender — done (commit 3736ec2).

## §E10 — Вкладка «Відправлення»

🟢 Insurance/Packaging/Parcel-money checkboxes — done.
🟢 «Безумовне +3% скасувати» — done.
🟢 «(1000)» receipt line — done.
🟢 BUG «оголошена вартість в Євро при грн» — fixed (commits d5ba582, ce1eabd).
❌ FieldHint texts not customized per role (staff vs client different wording).
❌ **«Поле Пакет при заповненні Клієнтом відсутнє»** — `new-order/page.tsx:445` still shows «Пакет (передача готівки отримувачу)» for the client. Must hide for client role.
🟡 Опис відправлення autocomplete — `DescriptionAutocomplete` exists; verify it's wired in both forms.

## §E11 — Вкладка «Параметри відправлення»

🟢 «Поле "Потребує пакування" забрати» — per-place checkbox removed (commit 83cf920).
❌ **BUG «Невірно рахується Розрахункова вага! Бере більшу!»** — `prisma/schema.prisma:510` `weightType @default(actual)`. `actual` returns `max(a,v)`. ТЗ wants fraction-combination. `custom` type + `weightCustomFactualFraction` field exist but are not the default and existing tariffs use `actual`. **Unfixed.**
❌ Окрема вкладка в Тарифах для правила ваги — currently one dropdown in the main pricing card.

## §E12 — Вкладка «Оплата»

🟢 «Відправити рахунок» + SMS pipeline — done (commit 4f81b13).
🟢 Send-invoice buttons next to pencil — done.
🟢 «Безготівка відв'язати від Оплата в Україні» — done (commits 4f81b13, 83cf920).
🟢 «Потребує пакування» прибрати — done.
📝 «Сума згідно Тарифів» — calculator does it; needs `/admin/pricing` filled.

## §E13 — Вкладка «Спосіб прийому/видачі»

❌ **«1. Для Працівника — ця вкладка не відображається»** — `parcels/new/page.tsx:913` still renders the «Спосіб прийому/видачі посилки» card for staff. Must hide entirely for staff (the method choice should move into the §E9 «Спосіб відправки» selector — depends on E9 refactor).
🟢 Client-side hint texts — done (commit bb3cad1).
🟢 Виклик кур'єра UA-Lviv-only — `ServiceCity` table (commit 4341e4c).
❌ «Відправка поштою» (UA) — ФОП Добровольський block: phone +380673320502, ЄДРПОУ 2236117857, full supporting-letter instructions. Static text not implemented.

## §E14 — Вкладка «Розрахунок вартості»

❌ Not a separate tab — `CostCalculator` is embedded near bottom of `parcels/new`. ТЗ wants dedicated section with full breakdown rows (факт/об'ємна/розрахункова/доставка/страх/пакування/пакет/Всього).
🟡 Client direction picker — verify no auto-default for client (ТЗ: «Виберіть напрямок» with no last-used).

## §E46 — Кур'єр (роль)

🟢 `/my-parcels` 3 buckets — done.

## §E47 — Клієнт (роль)

🟢 «Бачить лише свої посилки» — done.
🟢 ITN assigned — done.
🟢 ITN + ТТН поряд — done (commit 7809e03).

## §E48 — Тарифи: правила ваги

🟢 Формула об'ємної ваги — `VOLUMETRIC_DIVISOR=4000`.
🟡 «Комбінація часток» — `custom` type exists but not default. See §E11.

## §E49 — Тарифи Нідерланди

🟡 «2 €/кг» — seed-default. Prod DB rows may still have 5 €/кг — admin fixes manually.
❌ **«Виняток: Отримувач у Львові → 1.5 €/кг»** — not implemented. Calculator ignores receiver city.
🟢 Мінімалки 30/15/15/15 — fields exist (`addressDeliveryPrice`/`pickupPointPrice`/`minMultiPerAddress`/`minBothDirections`).

## §E50 — Тарифи Австрія

🟡 «1.5 €/кг» — seed-default.
❌ «Виняток: Львів → 1.0 €/кг» — not implemented.
🟢 Мінімалки 15/10/10/10 — fields exist.

## §E52/§E53 — Поля по напрямках / Алгоритми

🟢 Назва пари «Нідерланди → Україна» — done (commit 3736ec2).
🟢 «Ціна за кг» / «Адресна доставка» баг «не стерти 0» — fixed (string-state).
🟢 Поля «Пункт збору» / «Страхування %» / «Пакування €/10кг» / «Пакет %» — added.
❌ **«Пакет% — ДВА віконця: ≤2000 і >2000»** — currently single `parcelMoneyPercent` field.

## §E54 — Алгоритм розрахунку вартості

🟢 All 5 steps implemented in `calculateParcelCost()`.

## §E55–E61 — Статуси

🟡 Enum values exist (`draft`, `accepted_for_transport_*`, `in_transit_*`, `delivered_*`).
❌ **Автоматичні переходи** «Прийнято → В дорозі з моменту початку рейсу» — needs cron. Not implemented.
❌ «Доставлено присвоюється ПІСЛЯ оплати» — currently any staff can mark delivered, no payment coupling.
🟡 «Доставлено → не змінюється» — transition map blocks it; super-admin override path not blocked.
❌ «Створена → змінює лише Працівник» — verify client cannot PATCH own draft status.

---

## Honest summary for the user

- **Big refactors NOT done:** §E7, §E8, §E9 (uniform receiver/sender/new-client forms), §E13 staff hide, §E14 separate tab, phone code+number split.
- **Real bugs NOT fixed:** §E7 phone-edit collision, §E11 weight default, §E10 client sees «Пакет».
- **Tariff gaps:** §E49/§E50 Lviv exception, §E53 two-tier Пакет%.
- **Status automation:** §E55–E61 auto-transitions, payment-coupled delivery.
- **Done in code (unverified by client):** filters, autocomplete, ITN+TTN, SMS-invoice, currency conversion, services checkboxes, share-button, camera capture, notes.

The client's file shows EVERYTHING black. Treat the project as «mostly not accepted» until the client re-marks green.

## Priority backlog (do in this order)

1. §E7 phone-edit collision bug — small, high-impact, blocks daily use.
2. §E11 weight default — change `actual`→`custom` migration OR semantics.
3. §E10 hide «Пакет» for client — small.
4. §E13 hide collection tab for staff — small-ish (or fold into E9).
5. §E49/§E50 Lviv exception — calculator + tariff fields.
6. §E53 two-tier Пакет% — schema + UI + calc.
7. §E4 payment card minimization + «Розрахунок вартості» row structure.
8. §E55–E61 status automation (cron).
9. §E7/§E8/§E9 big form refactor (the largest single chunk).
