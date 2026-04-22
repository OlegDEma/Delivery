'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Сторінка «Забув пароль» — крок 1: користувач вводить email, ми відсилаємо
// Supabase reset-password лист. Крок 2 (встановлення нового пароля) —
// сторінка /reset-password, куди веде лінк у листі.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email) {
      setError('Введіть email');
      return;
    }
    setSending(true);
    const supabase = createClient();
    // Лінк у листі веде на /reset-password — Supabase підставить код у URL.
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setSending(false);
    if (err) {
      // Не розкриваємо чи існує такий email — повертаємо загальне «перевірте пошту».
      // Але явні помилки типу rate-limit варто показати.
      if (/rate/i.test(err.message)) {
        setError('Забагато запитів. Спробуйте через кілька хвилин.');
        return;
      }
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Перевірте пошту</CardTitle>
          <CardDescription>
            Якщо цей email зареєстрований, ми надіслали на нього посилання для
            скидання пароля. Перевірте вхідні (і папку «Спам»).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="block text-center text-sm text-blue-600 hover:underline">
            ← Повернутися до входу
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Забули пароль?</CardTitle>
        <CardDescription>
          Введіть email — ми надішлемо посилання для скидання пароля.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? 'Надсилання...' : 'Надіслати посилання'}
          </Button>
          <Link href="/login" className="block text-center text-sm text-blue-600 hover:underline">
            ← Повернутися до входу
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
