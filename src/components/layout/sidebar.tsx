'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/use-auth';
import { ROLE_LABELS, ADMIN_ROLES, type Role } from '@/lib/constants/roles';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
      { label: 'Сканер QR', href: '/scan' },
      { label: 'Посилки', href: '/parcels' },
      { label: 'Мої посилки', href: '/my-parcels', roles: ['driver_courier'] },
      { label: 'Клієнти', href: '/clients' },
    ],
  },
  {
    title: 'Логістика',
    items: [
      { label: 'Поїздки', href: '/journeys' },
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
      { label: 'Замовлення клієнтів', href: '/parcels/pending-orders', roles: ['super_admin', 'admin', 'driver_courier'] },
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
      { label: 'Імпорт даних', href: '/admin/import' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, fullName } = useAuth();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b">
        <Link href="/" className="text-xl font-bold text-blue-700">
          Delivery
        </Link>
      </div>

      {/* Quick search */}
      <div className="px-3 pt-3 pb-1">
        <input
          type="text"
          placeholder="Пошук..."
          className="w-full px-3 py-1.5 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition-all"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = (e.target as HTMLInputElement).value.trim();
              if (val) window.location.href = `/search?q=${encodeURIComponent(val)}`;
            }
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => {
          // Hide entire group if role doesn't match
          if (group.roles && (!role || !group.roles.includes(role))) return null;

          const visibleItems = group.items.filter(
            item => !item.roles || (role && item.roles.includes(role))
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
              {group.title && (
                <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const isActive = pathname === item.href ||
                    (item.href !== '/' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User info */}
      <div className="p-4 border-t">
        <div className="text-sm font-medium text-gray-900 truncate">
          {fullName || 'Користувач'}
        </div>
        <div className="text-xs text-gray-500 mb-3">
          {role ? ROLE_LABELS[role] : ''}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleLogout}
        >
          Вийти
        </Button>
      </div>
    </aside>
  );
}
