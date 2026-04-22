'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Крок 2 flow'у «Забув пароль»: користувач перейшов за лінком з email.
// Supabase встановлює сесію recovery у URL (PKCE-код або хеш). Тут ми
// дозволяємо встановити новий пароль через auth.updateUser({ password }).
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div />}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase автоматично обробляє hash-фрагмент з email лінка й створює
    // recovery-сесію. Чекаємо поки вона існує перш ніж дозволити submit.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else setError('Посилання недійсне або застаріло. Запитайте нове на сторінці «Забув пароль».');
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Пароль має бути не менше 8 символів');
      return;
    }
    if (password !== confirm) {
      setError('Паролі не співпадають');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError(err.message || 'Не вдалося оновити пароль');
      return;
    }
    // Відразу логін — Supabase оновив сесію. Відправимо на головну за роллю.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      router.push(profile?.role === 'client' ? '/my-orders' : '/');
      router.refresh();
    } else {
      router.push('/login');
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Новий пароль</CardTitle>
        <CardDescription>Придумайте новий пароль для вашого акаунта</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Новий пароль</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              disabled={!ready}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Повторіть пароль</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={!ready}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving || !ready}>
            {saving ? 'Збереження...' : 'Зберегти пароль'}
          </Button>
          <Link href="/login" className="block text-center text-sm text-blue-600 hover:underline">
            ← До входу
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
