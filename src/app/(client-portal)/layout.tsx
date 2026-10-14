'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { label: 'Мої замовлення', href: '/my-orders' },
  { label: 'Нове замовлення', href: '/new-order' },
  { label: 'Відстеження', href: '/tracking' },
];

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function handleLogout() {
    // Відкликаємо сесію на сервері Supabase (best-effort, не блокуємось).
    createClient().auth.signOut().catch(() => {});
    // Гарантовано прибираємо supabase auth-cookie вручну: лише на
    // `await signOut()` покладатись не можна — мережевий виклик інколи
    // зависав, і користувач лишався в порталі (cookie не httpOnly).
    for (const c of document.cookie.split(';')) {
      const name = c.trim().split('=')[0];
      if (name.startsWith('sb-')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    }
    // Жорстка навігація — сервер перевірить очищену сесію і віддасть /login.
    window.location.href = '/login';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        {/* На телефоні (375 px) пункти меню не влазили в один рядок разом з логотипом —
            сторінка отримувала горизонтальну прокрутку (знайдено 14.10.26 при тесті ТЗ 12.10).
            Тепер: рядок 1 — логотип + «Вийти», рядок 2 — меню на всю ширину; від sm — один рядок. */}
        <div className="max-w-3xl mx-auto px-4 py-2 sm:py-0 sm:h-14 flex flex-wrap items-center justify-between gap-y-1">
          {/* ТЗ docx 21.09.26 (п.2): у клієнтському порталі (в т.ч. на створенні
              посилки) назва теж «ПОСИЛОЧКА». */}
          <Link href="/my-orders" className="text-lg font-extrabold brand-wordmark">ПОСИЛОЧКА</Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="sm:order-last text-gray-500">
            Вийти
          </Button>
          <nav className="w-full sm:w-auto sm:ml-auto flex items-center gap-1">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-auto sm:flex-none min-w-0 text-center px-1 sm:px-3 py-1.5 text-[13px] sm:text-sm rounded-lg whitespace-nowrap',
                  pathname === item.href ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
