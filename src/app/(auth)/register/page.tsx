'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('+');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email || !password || !firstName || !lastName || !phone) {
      setError('Заповніть всі поля');
      return;
    }
    if (password.length < 6) {
      setError('Пароль має бути мінімум 6 символів');
      return;
    }

    setLoading(true);

    const res = await fetch('/api/client-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName, phone }),
    });

    if (res.ok) {
      // Auto-login
      const supabase = createClient();
      await supabase.auth.signInWithPassword({ email, password });
      router.push('/my-orders');
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Помилка реєстрації');
    }
    setLoading(false);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Реєстрація</CardTitle>
        <CardDescription>Створіть акаунт для відстеження посилок</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <Label>Пароль *</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Прізвище *</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div>
              <Label>Ім&apos;я *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label>Телефон *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380..." className="text-base" required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">Реєстрація успішна!</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Реєстрація...' : 'Зареєструватися'}
          </Button>
          <p className="text-center text-sm text-gray-500">
            Вже маєте акаунт? <Link href="/login" className="text-blue-600 hover:underline">Увійти</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
