# ТЗ Audit (state as of 2026-05-09)

The client's spec lives at `C:\Users\olegd\Downloads\Загальна схема програми (1).xlsx`. Rows are numbered (E3, E4, ...). Green text = done; black = not done; column F sometimes has «Не зроблено» / «Чекаємо на Тарифи».

Re-verify in the actual xlsx before trusting this audit — it's static. The client edits the file as work progresses.

Notation:
- ✅ Done in code AND verified by user (rare — most «done» items are unverified)
- 🟢 Done in code, not verified in UI
- 🟡 Partially done — listed sub-items missing
- ❌ Not done
- 📝 Code is there, but tariff data / settings need manual setup in `/admin/*`

## ROW-BY-ROW

### §E3 — Список посилок (general page)

❌ «Розгорнутий загальний список посилок забрати. Відображати лише ті, які ще не прив'язані до конкретного кур'єра.»
- Status: 🟡 default filter is `COURIER_UNASSIGNED` (correct), but «розгорнутий» list still shows when user picks «Всі посилки». The «забрати» wording is ambiguous — clarify with user whether the «Всі посилки» option should be deleted entirely.

🟢 Filter by courier-who-accepted (`acceptedById` ↔ `parcel.collectedById`) — done in commit `330992f`.

❌ «У фільтрі вибору по даті в мобільній версії має бути кнопка "Очистити"».
- Status: mobile «Clear date filter» button not implemented. Desktop has it.

🟢 «Має бути візуально зрозумілим, які з фільтрів зараз включені — підсвітити синім.»
- Done with `activeCls` highlighting on `<SelectTrigger>` — verify visually.

### §E4 — Тіло посилки (parcel detail page)

🟡 «Місця → Редагувати» — must return to «previous form» (the rich create-form with all per-place rows).
- Status: currently inline edit within `ParcelPlacesCard`. ТЗ wants full re-open of `parcels/new`-style form with prefilled values. Not done.

🟢 «Слова "Загальна вага" забрати» — done in `parcel-places-card.tsx`.

🟡 Голубе поле «Розрахунок вартості» — структура:
- ❌ Currently shows: «Доставка X EUR», «Страхування Y», «Пакування Z», «Всього».
- ТЗ wants: фактична вага, об'ємна вага, розрахункова вага, потім доставка/страхування/пакування/пакет, потім Всього.
- Status: needs restructure of `cost-calculator.tsx` to display weight rows.

🟢 «Вкладка "Деталі" — без змін» — leave alone.

❌ «Вкладка "Оплата" — залишити лише слова "До оплати" — і в кінці рядка суму. Решту забрати»
- Status: `ParcelPaymentCard` currently has detailed cost breakdown, history, payment dialog. ТЗ wants minimal. Big change.

🟢 «Друк етикетки» / «Повторити» / «Поділитись» — buttons exist.

❌ «Поділитись» — must default to Gmail / WhatsApp / Viber with receiver contact prefilled.
- Status: native share API only. Custom-targeted share not built.

❌ «Відправник» / «Отримувач» — зменшити розмір поля.
- Status: visual density change, not done.

🟢 «Місця після прийняття — лише Суперадмін редагує вагу/розміри» — `isEditLocked` logic in detail page handles this.

🟢 «Деталі після прийняття — лише Суперадмін» — same lock applies.

🟢 «Спосіб прийому посилки звідси забрати» — removed in commit `83cf920`.

❌ «Рейс Європа → Україна» — забрати, відображати лише дату фактичного рейсу.
- Status: trip block currently shows direction. Need to hide direction, show just date + assigned courier.

🟢 «Нова Пошта» — забрати з окремого блоку. ТТН поряд з ІТН вверху.
- Done — ITN+TTN in header in commit `7809e03`. No separate Nova Poshta card.

❌ Кнопка «Додати фото» замість поля.
- Status: still a field with upload UX. Need icon-button.

❌ Camera capture on mobile («відкривати фотоапарат»).

❌ Кнопка «Додати нотатку» замість поля.

🟢 «Вікно доставки (4 години) забрати» — removed in earlier commit.

❌ «Доставлено → блокувати зміну статусу».
- Status: `STATUS_TRANSITIONS` map allows `delivered_ua` / `delivered_eu` to terminate, but the UI on detail page may still show the status dropdown. Verify.

❌ «Нотатка має відображатись на видному місці зразу при вході в посилку».
- Status: notes hidden behind «Note» field/button. Need prominent banner.

### §E5 — Список посилок: відображення «Кому → Куди → Від → Звідки»

🟢 «Спочатку Кому:, потім Від:» — done in commit `7114cfe`.

🟡 List card structure:
- ТЗ: Кому (отримувач) / Куди (адреса) / Від (відправник) / Звідки (адреса).
- Current code shows: receiver name + phone, receiver address, sender name + phone, sender address. The labels say «Кому:» and «Від кого:» but ТЗ wants «Куди:» / «Звідки:» as separate explicit labels.
- Status: verify in `/parcels` list rendering.

### §E6 — Нова посилка (staff)

❌ «Напрямок встановлений Працівником при вході залишається по замовчуванню.»
- Status: form has `setDirection` from `localStorage.parcel:lastDirection`. Done but verify. Direction picker may default to empty for client portal per ТЗ §14.

### §E7 — Вкладка «Отримувач» (uniform across staff + client)

❌ MAJOR REFACTOR — not started:
- «Спосіб доставки» selector with 3 options: «Адресна доставка», «Пошта», «Пункт видачі».
- Голубе підсумкове поле after fill, «Редагувати» button replacing «×».
- Currently: separate sender/receiver search + inline AddressEditor with edit modal.

🟢 Автокомпліт міста (Am → Amsterdam) — done via `AddressInput` (commits `bb3cad1`, `f63e35d`).

❌ BUG: «При спробі редагувати лише телефон створеного Отримувача видає "Клієнт з таким номером вже існує"».
- Repro path: open existing client → edit only phone → save → 409 collision with self. Status: not fixed. Likely needs change in `/api/clients/[id]` PATCH to allow same-phone if it's the same client ID.

❌ «Пункт видачі» list filtered by receiver country+city from `CollectionPoint` table.

### §E8 — Новий клієнт (uniform staff + client)

❌ MAJOR REFACTOR not started. New structure:
- «Адреса» dropdown (replaces «Метод доставки»):
  - «Адресна доставка» (был «Адреса»)
  - «Відділення»
  - «Пункт збору» (нове, з вільним текстом)
- Індекс перед «Населений пункт».
- Country dropdown depends on direction (для eu_to_ua receiver: тільки UA).
- Phone split into country-code + number, with flag icons.
- Phone codes hardcoded: +43 AT, +31 NL, +380 UA, +49 DE.
- Info hints near each phone part.

### §E9 — Вкладка «Відправник»

❌ MAJOR REFACTOR like §E7:
- «Спосіб відправки» selector with 3 options: «Виклик кур'єра», «Пошта», «Пункт збору».
- 🟢 «Виклик кур'єра» multi-parcel question — done in commit `c584de5`.
- Option visibility filtered by what's configured in `/logistics`.

🟢 «Адресна доставка» → «Адреса відправки» (тільки для відправника) — done in commit `3736ec2`.

### §E10 — Вкладка «Відправлення»

🟢 Insurance/Packaging/Parcel-money checkboxes — done.

🟢 «Безумовне +3% скасувати» — done.

🟢 «(1000)» in receipt — done.

❌ FieldHint texts (info-«і» icons) — ТЗ wants specific text for staff vs client. Not customized per role.

❌ «Поле Пакет при заповненні Клієнтом відсутнє» — currently visible for client. Hide.

🟢 BUG: «Оголошена вартість в Євро незважаючи на грн» — fixed in commits `d5ba582` + `ce1eabd` (added `uahPerEur` conversion + direction-based fallback for currency).

❌ Autocomplete на «Опис відправлення» — DescriptionAutocomplete exists, verify it actually triggers in the form. May need wiring.

### §E11 — Вкладка «Параметри відправлення»

🟢 «Поле "Потребує пакування" забрати» — removed per-place checkbox in commit `83cf920`.

❌ BUG: «Невірно рахується Розрахункова вага! Бере більшу замість рахувати згідно правил!»
- Status: critical. Default `weightType='actual'` returns `max(a, v)` when `v > a`. ТЗ wants combination of fractions. Fix: migrate existing tariffs to `weightType='custom'` with `weightCustomFactualFraction=0.5`, or change `actual` semantics. Hasn't been done — risky data change.

❌ «Окрема вкладка в Тарифах для правила обрахунку Розрахункової ваги.»
- Currently weight type is one dropdown + one field in the main pricing card. ТЗ wants a dedicated subsection. Cosmetic.

### §E12 — Вкладка «Оплата»

🟢 «Відправити рахунок» чекбокс + SMS pipeline — done (`invoice-sms.ts`, commit `4f81b13`).

🟢 «При входженні в уже створену посилку — кнопки Send Invoice праворуч від олівця» — done via `<SendInvoiceButton>` (commit `4f81b13`).

🟢 «Безготівка відв'язати від Оплата в Україні» — done in commit `83cf920` (`/parcels/new` had this since `4f81b13`; `ParcelDetailsCard` fixed in `83cf920`).

🟢 «Поле "Потребує пакування" забрати» — done.

📝 «Сума оплати обраховується згідно правил Тарифів» — calculator does this; depends on tariff config being filled out in `/admin/pricing`.

### §E13 — Вкладка «Спосіб прийому/видачі посилки»

❌ «1. Для Працівника — ця вкладка НЕ відображається.»
- Currently: `parcels/new` shows it. ТЗ wants it removed for staff entirely. The collection method would have to move into `Sender` block (§E9). Big refactor.

🟢 «2. Для Клієнта — переписати тексти підказок» — done in commit `bb3cad1` (`COLLECTION_METHOD_HINTS_CLIENT`).

🟢 «Виклик кур'єра» доступний у UA лише для Львова — done via `ServiceCity` table (commit `4341e4c`).

❌ «При виборі Відправка поштою (UA) — показати реквізити ФОП Добровольський…»
- Static text with phone +380673320502, ЄДРПОУ 2236117857, full instructions. Not implemented as a UI block. Move to `COLLECTION_METHOD_HINTS_CLIENT` or a dedicated component.

### §E14 — Вкладка «Розрахунок вартості»

❌ «Окрема вкладка перед кнопкою Створити замовлення».
- Currently `CostCalculator` is embedded near the bottom of `parcels/new`. ТЗ wants it as a dedicated «section» with full breakdown (фактична / об'ємна / розрахункова / доставка / страхування / пакування / пакет / Всього). Mostly cosmetic.

❌ «Поле "Напрямок" → "Виберіть напрямок". Без можливості залишити останній.»
- For Client only. The Client form was given a no-default direction. Verify it doesn't auto-fill.

### §E46 — Кур'єр (роль)

🟢 Сторінка `/my-parcels` з 3 buckets — done.

### §E47 — Клієнт (роль)

🟢 «Бачить лише свої посилки» — done.

🟢 «ITN присвоюється» — done.

🟢 «ITN + ТТН поряд» — done in commits `7809e03` + invoice display.

### §E48 — Тарифи: правила ваги

🟢 Формула об'ємної ваги — `VOLUMETRIC_DIVISOR=4000` константа.

🟡 «Розрахункова — комбінація часток» — `weightType='custom'` + `weightCustomFactualFraction` field exist, but default is `actual` (max). Existing tariffs need migration.

### §E49 — Тарифи Нідерланди

🟡 «2 €/кг» — seed-default. Existing DB rows have 5 €/кг — admin needs to fix manually.

❌ «Виняток: якщо Отримувач у Львові — 1.5 €/кг»
- Status: not implemented. Needs calculator to know receiver city.

🟢 Мінімалки 30/15/15/15 — fields exist (`addressDeliveryPrice` / `pickupPointPrice` / `minMultiPerAddress` / `minBothDirections`). Seed-default set. Existing tariffs need manual fix.

### §E50 — Тарифи Австрія

🟡 «1.5 €/кг» — seed-default 1.5; existing DB may have 5.

❌ «Виняток: 1.0 €/кг для Львова» — not implemented.

🟢 Мінімалки 15/10/10/10 — fields exist.

### §E52/§E53 — Поля по напрямках / Алгоритми

🟢 Назва пари «Нідерланди → Україна» — done in commit `3736ec2`.

🟢 «Ціна за кг» / «Адресна доставка» — баг «не стерти 0» виправлено — string-state in `admin/pricing`.

🟢 Поля «Пункт збору» / «Страхування %» / «Пакування €/10кг» / «Пакет %» — додані.

❌ ВАЖЛИВЕ: «У полі Пакет% зробити ДВА віконця: до 2000 і понад 2000» — two-tier рейт. Зараз одне поле.

### §E54 — Алгоритм розрахунку вартості

🟢 Алгоритм у калькуляторі реалізовано:
1. Beregne фактична + об'ємна вага → розрахункова.
2. × pricePerKg.
3. `max(base, applicable_minimum)` де мінімум залежить від collectionMethod / isMultiParcelPickup / isBothDirections.
4. + страхування (% від declaredValue в EUR).
5. + пакування (€ / 10 кг).
6. + пакет (% від суми).
- Всі п'ять кроків присутні в `calculateParcelCost()` (src/lib/utils/pricing.ts).

### §E55–§E61 — Статуси

🟡 Статуси існують у `ParcelStatus` enum:
- `draft` (≈ «Створена»)
- `accepted_for_transport_to_ua` («ПдпУ»)
- `accepted_for_transport_to_eu` («ПдпЄ»)
- `in_transit_to_ua` («ВдУ»)
- `in_transit_to_eu` («ВдЄ»)
- `delivered_ua` / `delivered_eu`

❌ Автоматичні переходи (Прийнято → В дорозі з моменту початку рейсу) — потрібен cron / тригер, не зроблено.

❌ «Створена → змінювати може ТІЛЬКИ Працівник» — RBAC need verification.

❌ «Доставлено → присвоюється після оплати» — currently any staff can mark delivered. Not coupled to payment.

❌ «Після Доставлено — статус неможливо змінити» — need to lock `delivered_*` as terminal.

## Open backlog (deduplicated, prioritized)

Сort by impact / risk (high first):

1. **Weight calculator default broken** (§E11) — change `weightType` default to `custom` OR change `actual` semantics. Risky data change.
2. **«Клієнт з таким номером вже існує» при редагуванні лише телефона** (§E7) — UX-breaking bug.
3. **Виняток для Львова в тарифі** (§E49/§E50) — calculator must check receiver.city.
4. **«Пакет%» 2 рейти (до/після 2000)** (§E53) — schema + UI + calculator change.
5. **Статуси автоматичні переходи** (§E55–E61) — cron job for trips that start.
6. **Великий refactor: §E7/§E8/§E9** — uniform receiver+sender forms with «Спосіб доставки» / «Спосіб відправки» selectors.
7. **§E10 FieldHint texts** — different hints per role.
8. **§E14 окрема вкладка** — visual restructure.
9. **§E4 деталі посилки** — list of smaller items (camera capture, share dropdown, prominent note, lock terminal status).
10. **Multi-location** (architectural, see `references/locations.md`).
