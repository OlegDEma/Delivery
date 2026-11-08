import {
  Home, ScanLine, Package, Truck, Users,
  Route, Calendar, Map, Warehouse, Bus,
  Wallet, AlertCircle, BarChart3, FileText,
  UserCog, Tags, MapPin,
  Users2, ListChecks, Receipt,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/constants/roles';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[];
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
  roles?: Role[];
  /** If true, group starts collapsed (user clicks title to expand). */
  collapsible?: boolean;
}

/**
 * Структура меню узгоджена за документом «Загальна схема програми»:
 * 5 груп — Головна / Замовлення / Логістика / Фінанси / Адміністрування.
 * «Претензії», «Доступні», «Замовлення клієнтів», «Пункти збору» в Admin
 * прибрані з меню (функціонал лишається доступним по URL/через фільтри).
 *
 * ТЗ docx 04.11.26 (п.9): «Чому у комп'ютері та смартфоні різне меню для Суперадміна?»
 * — мобільне меню мало ВЛАСНУ копію цього списку, у яку не потрапили «Міста
 * обслуговування» і «Реквізити рахунка». Тепер один список на обидва меню
 * (Sidebar і MobileNav), щоб вони більше не розходились.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Головна', href: '/', icon: Home },
      { label: 'Сканер QR', href: '/scan', icon: ScanLine, roles: ['super_admin', 'admin', 'warehouse_worker', 'driver_courier'] },
    ],
  },
  {
    title: 'Замовлення',
    items: [
      { label: 'Посилки', href: '/parcels', icon: Package, roles: ['super_admin', 'admin', 'cashier', 'warehouse_worker'] },
      { label: 'Мої посилки', href: '/my-parcels', icon: Truck, roles: ['driver_courier'] },
      { label: 'Пасажири', href: '/passengers', icon: Users2, roles: ['super_admin', 'admin', 'driver_courier'] },
    ],
  },
  {
    title: 'Логістика',
    roles: ['super_admin', 'admin', 'driver_courier', 'warehouse_worker'],
    items: [
      { label: 'Поїздки', href: '/journeys', icon: Route, roles: ['super_admin', 'admin', 'driver_courier'] },
      { label: 'Рейси', href: '/trips', icon: Truck, roles: ['super_admin', 'admin', 'driver_courier'] },
      { label: 'Маршрути', href: '/routes', icon: Map, roles: ['super_admin', 'admin', 'driver_courier'] },
      { label: 'Пункти збору', href: '/collection-points', icon: MapPin, roles: ['super_admin', 'admin', 'warehouse_worker', 'driver_courier'] },
      { label: 'Календар', href: '/calendar', icon: Calendar, roles: ['super_admin', 'admin', 'warehouse_worker', 'driver_courier'] },
      { label: 'Склад', href: '/warehouse', icon: Warehouse, roles: ['super_admin', 'admin', 'warehouse_worker'] },
      // ТЗ docx 08.08.26: вкладка «Транспортні засоби» у Логістиці (Суперадмін).
      { label: 'Транспортні засоби', href: '/admin/vehicles', icon: Bus, roles: ['super_admin'] },
    ],
  },
  {
    title: 'Фінанси',
    collapsible: true,
    roles: ['super_admin', 'admin', 'cashier'],
    items: [
      { label: 'Каса', href: '/cash-register', icon: Wallet },
      { label: 'Борги', href: '/debts', icon: AlertCircle },
      { label: 'Звіти', href: '/reports', icon: FileText },
      { label: 'Аналітика', href: '/analytics', icon: BarChart3, roles: ['super_admin', 'admin'] },
    ],
  },
  {
    title: 'Адміністрування',
    collapsible: true,
    roles: ['super_admin', 'admin'],
    items: [
      { label: 'Користувачі', href: '/admin/users', icon: UserCog, roles: ['super_admin'] },
      // ТЗ docx 08.08.26: «Клієнти» перенесено з розділу «Замовлення» в «Адміністрування».
      { label: 'Клієнти', href: '/clients', icon: Users, roles: ['super_admin', 'admin', 'cashier'] },
      { label: 'Тарифи', href: '/admin/pricing', icon: Tags },
      { label: 'Міста обслуговування', href: '/admin/service-cities', icon: MapPin, roles: ['super_admin', 'admin'] },
      { label: 'Реквізити рахунка', href: '/admin/invoice-settings', icon: Receipt, roles: ['super_admin', 'admin'] },
      { label: 'Статуси', href: '/admin/statuses', icon: ListChecks, roles: ['super_admin', 'admin'] },
    ],
  },
];

/** Швидкий пошук (посилки, клієнти) — однаковий у меню комп'ютера і смартфона. */
export function goToSearch(value: string) {
  const q = value.trim();
  if (q) window.location.href = `/search?q=${encodeURIComponent(q)}`;
}
