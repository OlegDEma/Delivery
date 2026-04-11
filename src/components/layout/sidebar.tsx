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

const NAV_ITEMS: NavItem[] = [
  { label: 'Головна', href: '/' },
  { label: 'Посилки', href: '/parcels' },
  { label: 'Доступні', href: '/parcels/available' },
  { label: 'Замовлення клієнтів', href: '/parcels/pending-orders', roles: ['super_admin', 'admin', 'driver_courier'] },
  { label: 'Мої посилки', href: '/my-parcels', roles: ['driver_courier'] },
  { label: 'Пошук', href: '/search' },
  { label: 'Клієнти', href: '/clients' },
  { label: 'Рейси', href: '/trips' },
  { label: 'Маршрути', href: '/routes', roles: ['super_admin', 'admin', 'driver_courier'] },
  { label: 'Склад', href: '/warehouse', roles: ['super_admin', 'admin', 'warehouse_worker'] },
  { label: 'Каса', href: '/cash-register' },
  { label: 'Звіти', href: '/reports', roles: ['super_admin', 'admin'] },
  { label: 'Користувачі', href: '/admin/users', roles: ['super_admin'] },
  { label: 'Тарифи', href: '/admin/pricing', roles: ['super_admin', 'admin'] },
  { label: 'Пункти збору', href: '/admin/collection-points', roles: ['super_admin', 'admin'] },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, fullName } = useAuth();

  const filteredItems = NAV_ITEMS.filter(
    (item) => !item.roles || (role && item.roles.includes(role))
  );

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

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              {item.label}
            </Link>
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
