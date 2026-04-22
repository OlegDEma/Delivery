// Одноразовий скрипт: скинути пароль super_admin через service role.
// Usage: node scripts/reset-my-password.mjs
//
// Читає SUPABASE URL + service role key з .env, генерує новий пароль,
// оновлює його через Supabase admin API. Виводить у консоль.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Парсимо .env вручну щоб не підтягувати dotenv.
const envText = readFileSync(resolve(__dirname, '..', '.env'), 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const EMAIL = process.argv[2] || 'demaoleg78@gmail.com';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Знаходимо юзера по email (admin API listUsers — пагінація).
let user = null;
let page = 1;
while (true) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error('listUsers failed:', error.message); process.exit(1); }
  user = data.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
  if (user || data.users.length < 200) break;
  page++;
}

if (!user) {
  console.error(`User with email ${EMAIL} not found`);
  process.exit(1);
}

// Генеруємо новий пароль — 12 символів, readable alphabet.
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
let newPassword = '';
for (let i = 0; i < 14; i++) {
  newPassword += alphabet[Math.floor(Math.random() * alphabet.length)];
}

const { error } = await supabase.auth.admin.updateUserById(user.id, {
  password: newPassword,
});

if (error) {
  console.error('Update failed:', error.message);
  process.exit(1);
}

console.log('\n✅ Пароль оновлено');
console.log('Email:    ', EMAIL);
console.log('Новий пароль:', newPassword);
console.log('\n⚠️  Увійди, зайди в /admin/users і встанови свій пароль.');
