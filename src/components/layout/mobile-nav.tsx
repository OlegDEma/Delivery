'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/use-auth';
import { ROLE_LABELS, type Role } from '@/lib/constants/roles';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';

interface NavItem {
  label: string;
  href: string;
  roles?: Role[];
}

interface NavGroup {
  title?: string;
  items: NavItem[];
  roles?: Role[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Головна', href: '/' },
      { label: 'Посилки', href: '/parcels' },
      { label: 'Мої посилки', href: '/my-parcels', roles: ['driver_courier'] },
      { label: 'Клієнти', href: '/clients' },
    ],
  },
  {
    title: 'Логістика',
    items: [
      { label: 'Рейси', href: '/trips' },
      { label: 'Календар', href: '/calendar' },
      { label: 'Маршрути', href: '/routes', roles: ['super_admin', 'admin', 'driver_courier'] },
      { label: 'Склад', href: '/warehouse', roles: ['super_admin', 'admin', 'warehouse_worker'] },
    ],
  },
  {
    title: 'Фінанси',
    roles: ['super_admin', 'admin'],
    items: [
      { label: 'Каса', href: '/cash-register' },
      { label: 'Борги', href: '/debts' },
      { label: 'Звіти', href: '/reports' },
      { label: 'Аналітика', href: '/analytics' },
    ],
  },
  {
    title: 'Інше',
    items: [
      { label: 'Пошук', href: '/search' },
      { label: 'Доступні', href: '/parcels/available' },
      { label: 'Замовлення', href: '/parcels/pending-orders', roles: ['super_admin', 'admin', 'driver_courier'] },
      { label: 'Претензії', href: '/claims' },
    ],
  },
  {
    title: 'Налаштування',
    roles: ['super_admin', 'admin'],
    items: [
      { label: 'Користувачі', href: '/admin/users', roles: ['super_admin'] },
      { label: 'Тарифи', href: '/admin/pricing' },
      { label: 'Пункти збору', href: '/admin/collection-points' },
    ],
  },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { role, fullName } = useAuth();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="md:hidden flex items-center justify-between h-14 px-4 border-b bg-white sticky top-0 z-50">
      <Link href="/" className="text-lg font-bold text-blue-700">
        Delivery
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="sm" className="px-2" aria-label="Відкрити меню">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>
          }
        />
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="px-6 py-4 border-b text-lg font-bold text-blue-700">
            Delivery
          </SheetTitle>

          <nav className="flex-1 px-3 py-3 overflow-y-auto">
            {NAV_GROUPS.map((group, gi) => {
              if (group.roles && (!role || !group.roles.includes(role))) return null;
              const visibleItems = group.items.filter(
                item => !item.roles || (role && item.roles.includes(role))
              );
              if (visibleItems.length === 0) return null;

              return (
                <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
                  {group.title && (
                    <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {group.title}
                    </div>
                  )}
                  {visibleItems.map(item => {
                    const isActive = pathname === item.href ||
                      (item.href !== '/' && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div className="p-4 border-t mt-auto">
            <div className="text-sm font-medium text-gray-900">{fullName || 'Користувач'}</div>
            <div className="text-xs text-gray-500 mb-3">{role ? ROLE_LABELS[role] : ''}</div>
            <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
              Вийти
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
