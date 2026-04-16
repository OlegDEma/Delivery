'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, ScanLine, Package, Truck, Users,
  Route, Calendar, Map, Warehouse,
  Wallet, AlertCircle, BarChart3, FileText,
  PackageOpen, ClipboardList, AlertTriangle,
  UserCog, Tags, MapPin, Upload,
  Search, LogOut,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/use-auth';
import { ROLE_LABELS, type Role } from '@/lib/constants/roles';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
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
      { label: 'Головна', href: '/', icon: Home },
      { label: 'Сканер QR', href: '/scan', icon: ScanLine },
    ],
  },
  {
    title: 'Замовлення',
    items: [
      { label: 'Посилки', href: '/parcels', icon: Package },
      { label: 'Мої посилки', href: '/my-parcels', icon: Truck, roles: ['driver_courier'] },
      { label: 'Доступні', href: '/parcels/available', icon: PackageOpen },
      { label: 'Замовлення клієнтів', href: '/parcels/pending-orders', icon: ClipboardList, roles: ['super_admin', 'admin', 'driver_courier'] },
      { label: 'Претензії', href: '/claims', icon: AlertTriangle },
      { label: 'Клієнти', href: '/clients', icon: Users },
    ],
  },
  {
    title: 'Логістика',
    items: [
      { label: 'Поїздки', href: '/journeys', icon: Route },
      { label: 'Рейси', href: '/trips', icon: Truck },
      { label: 'Календар', href: '/calendar', icon: Calendar },
      { label: 'Маршрути', href: '/routes', icon: Map, roles: ['super_admin', 'admin', 'driver_courier'] },
      { label: 'Склад', href: '/warehouse', icon: Warehouse, roles: ['super_admin', 'admin', 'warehouse_worker'] },
    ],
  },
  {
    title: 'Фінанси',
    roles: ['super_admin', 'admin'],
    items: [
      { label: 'Каса', href: '/cash-register', icon: Wallet },
      { label: 'Борги', href: '/debts', icon: AlertCircle },
      { label: 'Звіти', href: '/reports', icon: FileText },
      { label: 'Аналітика', href: '/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Адміністрування',
    roles: ['super_admin', 'admin'],
    items: [
      { label: 'Користувачі', href: '/admin/users', icon: UserCog, roles: ['super_admin'] },
      { label: 'Тарифи', href: '/admin/pricing', icon: Tags },
      { label: 'Пункти збору', href: '/admin/collection-points', icon: MapPin },
      { label: 'Імпорт даних', href: '/admin/import', icon: Upload },
    ],
  },
];

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

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
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center h-16 px-5 border-b border-gray-200 shrink-0">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white text-sm font-bold">
            D
          </div>
          <span className="text-base font-semibold text-gray-900 tracking-tight">
            Delivery
          </span>
        </Link>
      </div>

      {/* Quick search */}
      <div className="px-3 pt-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Пошук посилок, клієнтів..."
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all placeholder:text-gray-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) window.location.href = `/search?q=${encodeURIComponent(val)}`;
              }
            }}
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => {
          // Hide entire group if role doesn't match
          if (group.roles && (!role || !group.roles.includes(role))) return null;

          const visibleItems = group.items.filter(
            item => !item.roles || (role && item.roles.includes(role))
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
              {group.title && (
                <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const isActive = pathname === item.href ||
                    (item.href !== '/' && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'group relative flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-normal'
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-600 rounded-r-full" />
                      )}
                      <Icon className={cn(
                        'w-4 h-4 shrink-0',
                        isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
                      )} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User info */}
      <div className="p-3 border-t border-gray-200 shrink-0">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {getInitials(fullName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate leading-tight">
              {fullName || 'Користувач'}
            </div>
            <div className="text-xs text-gray-500 truncate leading-tight">
              {role ? ROLE_LABELS[role] : ''}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-md transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Вийти
        </button>
      </div>
    </aside>
  );
}
