# Commands cheat-sheet

Run from `D:\Delivery` (the project root).

## Build / dev

```bash
npm run dev               # next dev — local dev server
npm run build             # prisma generate + next build (production-like)
npm run lint              # eslint
npm start                 # production server (after build)
```

## Quick verify cycle (use after every change)

```bash
# Fast (~3s)
npx tsc --noEmit

# Quick (~5s)
npx eslint <changed-files>

# Slow but catches Next.js-specific errors (~30-60s)
rm -rf .next && npm run build
```

Always nuke `.next/types` between TS checks if you've changed schemas, otherwise stale generated types cause false-positive errors:

```bash
rm -rf D:/Delivery/.next/types 2>/dev/null
```

## Prisma

```bash
# Apply migrations in order (idempotent, prod-safe)
npx prisma migrate deploy

# Regenerate the client after editing prisma/schema.prisma
npx prisma generate

# Open a Postgres shell against the configured DB
npx prisma db execute --file <(echo "select count(*) from parcels;") --schema prisma/schema.prisma
```

The project uses Supabase Postgres (`postgres.pooler.supabase.com`). Connection details in `.env` (`DIRECT_URL`).

## Writing migrations

NEVER use `prisma migrate dev` against the prod DB. Hand-write SQL:

```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_<short_name>
cat > prisma/migrations/.../<short_name>/migration.sql << EOF
-- Comment explaining WHY
ALTER TABLE "..." ADD COLUMN ...;
EOF

# Then update prisma/schema.prisma to match
# Then:
npx prisma migrate deploy
npx prisma generate
```

Verify in `_prisma_migrations` that the row was inserted.

## Git workflow

```bash
git status

# Commit. Always include Co-Authored-By per project convention.
git add <files>
git commit -m "$(cat <<'EOF'
short description in Ukrainian

Body explaining WHY (not WHAT — the diff shows what).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Push — use GIT_ASKPASS=true on Windows to avoid hang
GIT_ASKPASS=true git push origin main
```

If `GIT_ASKPASS=true` doesn't work, run `git push` synchronously in foreground (not `run_in_background: true`).

## Inspecting DB

The user is on Supabase. Cheap inspection:

```bash
# Open SQL editor in browser: <supabase-url>/project/_/sql/new
# Or use psql via DIRECT_URL:
psql "$(grep DIRECT_URL D:/Delivery/.env | cut -d= -f2-)"
```

Tables you'll touch most: `parcels, clients, client_addresses, pricing_config, trips, journeys, invoice_settings, sms_log, service_cities`.

## Reading the ТЗ

The Excel spec lives on the user's machine: `C:\Users\olegd\Downloads\Загальна схема програми (1).xlsx`. Open with the `xlsx` skill:

```python
from openpyxl import load_workbook
wb = load_workbook(r'C:\Users\olegd\Downloads\Загальна схема програми (1).xlsx')
sheet = wb['Аркуш1']

# Iterate rows; check font color for done/not-done
GREEN_FG = ('FF4EA72E', 'FF00B050', 'FF008000', 'FF92D050')
for row_idx in range(1, sheet.max_row + 1):
    cell = sheet.cell(row=row_idx, column=5)  # column E = task text
    if cell.value:
        fg = cell.font.color.value if cell.font.color else None
        is_done = fg in GREEN_FG
        ...
```

If the user mentions «зеленим» — green text means «вже працює добре». Black/dark text = «треба зробити». Column F sometimes has explicit `Не зроблено` or `Чекаємо на Тарифи`.

## Common one-liners

```bash
# How many parcels in a tariff direction with insurance
psql "$DIRECT_URL" -c "select count(*) from parcels where direction='eu_to_ua' and insurance_applied=true and deleted_at is null;"

# SMS logs for one parcel
psql "$DIRECT_URL" -c "select to_party, status, provider, created_at from sms_log where parcel_id='<UUID>' order by created_at desc;"

# Reset a stuck parcel for testing
psql "$DIRECT_URL" -c "update parcels set status='draft', total_cost=null, insurance_cost=null where id='<UUID>';"
```

## Telegram bot

`grammy` is in `package.json` (Telegram bot framework). Routes under `/api/telegram` — unfinished feature; the bot scaffolding exists but not actively used. Don't accidentally break it.

## Nova Poshta integration

API key in env (`NP_API_KEY`). Endpoints under `/api/nova-poshta/`. Used to fetch cities, warehouses, tracking status. Active feature — don't break.
