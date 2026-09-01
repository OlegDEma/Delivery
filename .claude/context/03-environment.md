# Середовище: Windows і macOS

Стек: **Next.js 16.2.3** (не той Next, що в тренувальних даних — читати
`node_modules/next/dist/docs/` перед нетривіальними змінами), **Prisma 7.7.0**
(кастомний клієнт у `src/generated/prisma`, комітиться), **Supabase** (Auth + Postgres
+ Storage), **Tailwind + shadcn/ui**, деплой **Vercel** з гілки `main`.

Node на ПК: **v22.14.0**, npm 11.2.0. На Mac ставити Node 22 LTS (`nvm install 22`).

## Перший запуск на новій машині (Mac)

```bash
git clone https://github.com/OlegDEma/Delivery.git && cd Delivery
npm install          # postinstall сам зробить prisma generate
```

Далі **скопіювати `.env` з ПК** (у git його немає). Потрібні ключі:

| Змінна | Для чого |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase проєкт |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | клієнтський доступ |
| `SUPABASE_SERVICE_ROLE_KEY` | серверні операції + Storage (фото транспорту) |
| `DIRECT_URL` | пряме підключення Postgres для Prisma-міграцій |
| `NP_API_KEY` | Nova Poshta |

Опційно (поки не задані — месенджери працюють через deep-link):
`TURBOSMS_TOKEN`, `TURBOSMS_SENDER`, `TURBOSMS_VIBER_SENDER`, `WHATSAPP_TOKEN`.

## Команди

| Дія | macOS / Linux | Windows |
|---|---|---|
| Dev-сервер | `npm run dev` | через PowerShell (див. нижче) |
| Типи | `npx tsc --noEmit` | те саме |
| Лінт | `npx eslint <файли>` | те саме |
| Білд | `rm -rf .next && npm run build` | `Remove-Item -Recurse -Force .next; npm run build` |
| Міграція | `npx prisma migrate deploy && npx prisma generate` | те саме |
| Пуш | `git push origin main` | `GIT_ASKPASS=true git push origin main` |

## ⚠️ Пастки середовища

**1. Після `next build` ОБОВʼЯЗКОВО видалити `.next` перед `npm run dev`.**
Прод-артефакти ламають dev-сервер: усі роути віддають 500
(`ENOENT .next/dev/routes-manifest.json`).

**2. Windows: dev-сервер піднімати ЛИШЕ через PowerShell, не через Bash-tool.**
Bash-tool працює в пісочниці з ізольованою мережею — Chrome на хості не достукається
(`ERR_CONNECTION_REFUSED`, хоча `curl` з Bash дає 200):
```powershell
Start-Process cmd -ArgumentList '/c','npm run dev > .tmp_devhost.log 2>&1' -WorkingDirectory 'D:\Delivery' -WindowStyle Hidden
```
**На macOS цього обмеження, найімовірніше, немає** — але перевірити на початку:
підняти `npm run dev` і відкрити `http://localhost:3000/login` у браузері.
Якщо браузер не бачить сервер, а `curl` бачить — застосувати ту саму логіку
(запускати поза пісочницею, напр. через окремий термінал).

**3. Пуш може «зависати» на багато хвилин, але зазвичай доходить.**
На Windows це Git Credential Manager. **Ніколи не робити висновок «пуш заблоковано»
без перевірки:**
```bash
git ls-remote origin refs/heads/main   # порівняти з git rev-parse HEAD
```
`git rev-list --count @{u}..HEAD` бреше, поки не оновиться tracking-ref.
На Mac буде `osxkeychain` — перший пуш попросить логін один раз.

**4. Одна БД на всіх.** Локальна розробка = прод-дані. Тестові правки відкочувати.

**5. `.tmp_*` файли** (логи dev/пушу) — сміття в корені, не комітити.
