'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  return (
    <Suspense fallback={<div />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('deactivated') === '1') {
      setError('Ваш обліковий запис деактивовано. Зверніться до адміністратора.');
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Введіть email та пароль');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      setError('Невірний email або пароль');
      setLoading(false);
      return;
    }

    // Role-based redirect: clients → /my-orders, staff → /
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile || profile.is_active === false) {
      await supabase.auth.signOut();
      setError('Обліковий запис неактивний. Зверніться до адміністратора.');
      setLoading(false);
      return;
    }

    const target = profile.role === 'client' ? '/my-orders' : '/';
    router.push(target);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Delivery</CardTitle>
        <CardDescription>Система управління доставкою</CardDescription>
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
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Вхід...' : 'Увійти'}
          </Button>
          <div className="flex justify-between text-sm">
            <Link href="/register" className="text-blue-600 hover:underline">Реєстрація</Link>
            <Link href="/forgot-password" className="text-gray-500 hover:underline">Забув пароль?</Link>
          </div>
          <div className="text-center text-sm">
            <Link href="/tracking" className="text-gray-500 hover:underline">Відстежити посилку</Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
