# ТЗ Audit — detailed, code-verified

Source: `C:\Users\olegd\Downloads\Загальна схема програми (2).xlsx`. Rows numbered E3…E61.

**v1 vs v2:** `(1).xlsx` and `(2).xlsx` are CONTENT-IDENTICAL. The client did not re-mark anything. The only green cell in both is `D3` («Загальна сторінка» — a section header, not a feature). Columns F7/F9 carry explicit `Не зроблено`, F12 `Чекаємо на Тарифи`.

**What that means:** From the **client's** point of view, NOTHING below is validated as done. The `🟢` marks in this file are MY (Claude's) code-level reading — they mean «the code path exists», NOT «the client accepted it». When reporting to the user, never say «done» based on a `🟢`. Say «реалізовано в коді, не підтверджено клієнтом».

Legend:
- 🟢 implemented in code, builds, NOT user-verified
- 🟡 partially implemented — sub-items listed
- ❌ not implemented
- 📝 code exists, but needs data/settings configured in `/admin/*`

This audit was code-verified on 2026-05-19 (grep + file reads) and updated 2026-05-20 after the round 4–8 bug-hunt (commits a2e4ffd, ffbf6d7, 5e053f2, 4abaf2c, cb54577, 5bf5303, 22104b7). Earlier versions of this file had false ❌/✅ — trust this one, but re-verify before claiming.

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
| Голубе поле «Розрахунок вартості» — структура (факт/об'ємна/розрахункова рядки) | 🟢 | `cost-calculator.tsx` — окремі рядки «Фактична вага» / «Об'ємна вага» / «Розрахункова вага» (commit 5bf5303) |
| Вкладка «Деталі» без змін | 🟢 | left alone |
| Вкладка «Оплата» — лише «До оплати» + сума | 🟢 | `ParcelPaymentCard` — прибрано дубльований розпис компонентів (commit 5bf5303); деталі лишилися в «Розрахунку вартості» |
| «Друк етикетки» / «Повторити» / «Поділитись» | 🟢 | all three exist |
| «Поділитись» → Gmail/WhatsApp/Viber з контактом отримувача | 🟢 | `src/components/shared/share-button.tsx` — wa.me, viber://, mailto, navigator.share |
| Відправник/Отримувач — зменшити поля | 🟡 | density not specifically reduced; verify visually |
| Після прийняття — лише Суперадмін редагує вагу | 🟢 | `isEditLocked` logic in detail page |
| «Спосіб прийому» прибрати з detail | 🟢 | removed (commit 83cf920) |
| «Рейс Європа → Україна» → лише дата | 🟢 | `page.tsx:536` — trip block shows only `departureDate` + `(country)`, no direction label |
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

🟢 **BUG, F7 «Не зроблено»** — fixed (commit a2e4ffd). Editing ONLY the phone of an existing client used to give «Клієнт з таким номером вже існує». `/api/clients/[id]/route.ts` PATCH now does an explicit `phoneNormalized` uniqueness check excluding `id: { not: id }`, skips the check when the normalized phone is unchanged, and names the conflicting client in the error.

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
🟢 **«Поле Пакет при заповненні Клієнтом відсутнє»** — fixed (commit 5e053f2). «Пакет» checkbox/amount removed from `new-order/page.tsx` (client portal).
🟡 Опис відправлення autocomplete — `DescriptionAutocomplete` exists; verify it's wired in both forms.

## §E11 — Вкладка «Параметри відправлення»

🟢 «Поле "Потребує пакування" забрати» — per-place checkbox removed (commit 83cf920).
🟢 **BUG «Невірно рахується Розрахункова вага! Бере більшу!»** — fixed (commit ffbf6d7). `weightType @default(custom)`; міграція перевела існуючі тарифи `actual`→`custom`. `custom` = `factualFrac × факт + (1−factualFrac) × об'ємна` коли об'ємна > фактичної; коли факт ≥ об'ємна — завжди береться фактична.
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
🟢 «Комбінація часток» — `custom` type is now the default (commit ffbf6d7). See §E11.

## §E49 — Тарифи Нідерланди

🟡 «2 €/кг» — seed-default. Prod DB rows may still have 5 €/кг — admin fixes manually.
🟢 **«Виняток: Отримувач у Львові → 1.5 €/кг»** — implemented (commit 4abaf2c). `PricingConfig.lvivPricePerKg` + `isLvivCity()` helper; calculator застосовує знижену ціну за кг коли `receiverCity` = Львів. Налаштовується в `/admin/pricing` («Ціна за кг — Львів»).
🟢 Мінімалки 30/15/15/15 — fields exist (`addressDeliveryPrice`/`pickupPointPrice`/`minMultiPerAddress`/`minBothDirections`).

## §E50 — Тарифи Австрія

🟡 «1.5 €/кг» — seed-default.
🟢 «Виняток: Львів → 1.0 €/кг» — implemented (commit 4abaf2c). Seed: AT `lvivPricePerKg=1.00`.
🟢 Мінімалки 15/10/10/10 — fields exist.

## §E52/§E53 — Поля по напрямках / Алгоритми

🟢 Назва пари «Нідерланди → Україна» — done (commit 3736ec2).
🟢 «Ціна за кг» / «Адресна доставка» баг «не стерти 0» — fixed (string-state).
🟢 Поля «Пункт збору» / «Страхування %» / «Пакування €/10кг» / «Пакет %» — added.
🟢 **«Пакет% — ДВА віконця: ≤2000 і >2000»** — implemented (commit cb54577). `PricingConfig.parcelMoneyPercentHigh` + `parcelMoneyThreshold` (default 2000); calculator вибирає tier за сумою. `/admin/pricing` — секція «Пакет» з трьома полями (поріг, % ≤, % >).

## §E54 — Алгоритм розрахунку вартості

🟢 All 5 steps implemented in `calculateParcelCost()`.

## §E55–E61 — Статуси

🟢 Enum values exist (`draft`, `accepted_for_transport_*`, `in_transit_*`, `delivered_*`).
🟢 **Автоматичні переходи** «Прийнято → В дорозі з моменту початку рейсу» — event-driven, не cron: `PATCH /api/trips/[id]` зі `status=in_progress` переводить усі прив'язані посилки в `in_transit_*` (`trips/[id]/route.ts:64`). Cron на `departureDate` був би менш коректним (затримки рейсу). Аналогічно `completed` → `at_lviv_warehouse`.
🟢 «Доставлено присвоюється ПІСЛЯ оплати» — fixed (commit 22104b7). PATCH відхиляє перехід у `delivered_*` коли `isPaid=false` (super_admin може обійти).
🟢 «Доставлено → не змінюється» — `isTerminal()` check у PATCH (`route.ts:148`) НЕ має super_admin-bypass — навіть суперадмін не змінить термінальний статус. Відповідає ТЗ «навіть програма не може».
🟢 «Створена → змінює лише Працівник» — `PATCH /api/parcels/[id]` за `requireStaff()` guard; клієнт взагалі не може PATCH-ити статус.

---

## Honest summary for the user

**Round 4–8 bug-hunt (2026-05-20) — these are FIXED in code, not client-verified:**
- §E7 phone-edit collision (commit a2e4ffd)
- §E11 weight default `actual`→`custom` (commit ffbf6d7)
- §E10 client sees «Пакет» — removed (commit 5e053f2)
- §E49/§E50 Lviv exception (commit 4abaf2c)
- §E53 two-tier Пакет% (commit cb54577)
- §E4 «Розрахунок вартості» row structure + «Оплата» minimization (commit 5bf5303)
- §E55–E61 payment-coupled delivery (commit 22104b7); auto-transitions already event-driven

**Still NOT done:**
- **Big refactors:** §E7/§E8/§E9 (uniform receiver/sender/new-client forms, phone code+number split), §E13 staff hide of collection tab, §E14 separate «Розрахунок вартості» tab.
- **Smaller:** §E10 FieldHint texts per role; §E13 «Відправка поштою» ФОП-Добровольський static block.
- **Done in code (unverified by client):** filters, autocomplete, ITN+TTN, SMS-invoice, currency conversion, services checkboxes, share-button, camera capture, notes.

The client's file shows EVERYTHING black. Treat the project as «mostly not accepted» until the client re-marks green.

## Priority backlog (do in this order)

1. §E13 hide collection tab for staff + ФОП-Добровольський postal block.
2. §E10 FieldHint texts per role (staff vs client wording).
3. §E14 separate «Розрахунок вартості» tab.
4. §E7/§E8/§E9 big form refactor (the largest single chunk — uniform forms, phone split).

---

## v3 review (`Загальна схема програми (3).xlsx`, client-reviewed 2026-05)

The client re-exported the ТЗ as `(3).xlsx` and reviewed it. Findings:
- **Green (font `FF4EA72E`) = accepted:** only `D3` (parcels list page) and `E16` (Пасажири). Nothing else green.
- **Column F «не зроблено» = client explicitly flags NOT done:** `E4`, `E7`, `E9`, `E11`, `E13`, `E14`.
- ФОП block (E13) static text moved INTO the v3 spec verbatim — see `collection-block.tsx`.

### What got done after the v3 review (verified)
- **§E4/§E14** — cost rows cleaned: «Вартість доставки» (no `(X EUR/кг)`/`· Львів`/`(мін…)` parens), «Пакет» row shows once an amount is entered, no `(сума €)` (commit `fa6fb0e`).
- **§E4/§E14** — packaging now computed from **billableWeight** not actualWeight (commit `84161cc`, ТЗ «до обрахунку брати Розрахункову вагу»).
- **§E11** — `/admin/pricing` split into two tabs: «Тарифи» + «Правило розрахункової ваги» (weight-type/fraction moved into the weight tab). Client `new-order` card «Місця» renamed → «Параметри відправлення» (commit `60a54b7`). «Потребує пакування» already removed earlier; weight calc (`getBillableWeight`) is correct.
- **§E13** — ФОП Добровольський postal block implemented; external_shipping enabled for UA-sender clients; collection block renders for client both directions (commit `84161cc`).
- **§E7/§E9** — `ClientSearch` selected-state: «Пошук…» label removed when filled; «×» replaced with «Редагувати» button (re-opens the confirm/edit dialog) + small «Очистити» (commit `f19a5d1`). Works for both receiver (E7) and sender (E9) — shared component.
- **§E8** — client `new-order`: country+phone-code auto-switch on direction change (commit `d08d64d`).

### §E7/§E9 — still NOT done (the big part)
- The inline `AddressEditor` block (under the blue summary in `parcels/new/page.tsx`) — ТЗ wants it removed («все решта — поле Адреса — забрати»). **NOT removed** — see pitfall below.
- «Спосіб доставки»/«Спосіб відправки» 3-option selector replacing «Адреса».
- Fully unifying the staff vs client receiver/sender forms.

**⚠️ Pitfall blocking inline-AddressEditor removal:** the receiver/sender address (`recvCity`/`senderCity`/… state in `parcels/new/page.tsx`) is what the submit sends. It is populated by `handleReceiverSelect`/`handleSenderSelect` from `client.addresses[0]`. The confirm dialog (`ClientCreateForm`) — when an EXISTING client that had NO stored address gets a new address typed in the dialog — was observed NOT to PATCH (no network PATCH fired), so `onSelect` returned a client without the address and `senderCity` stayed empty. Before removing the inline `AddressEditor`, the dialog's new-address save path MUST be verified/fixed, otherwise parcels save with an empty address (silent data bug).
