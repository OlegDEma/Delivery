'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, LogOut, Menu, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/use-auth';
import { ROLE_LABELS } from '@/lib/constants/roles';
import { NAV_GROUPS, goToSearch } from '@/components/layout/nav-config';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const router = useRouter();
  const { role, fullName } = useAuth();

  function toggleGroup(title: string, groupEl?: HTMLElement | null) {
    const opening = !openGroups[title];
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }));
    // ТЗ docx 09.10.26 (Загальні зауваження, п.1): розгорнутий кореневий розділ
    // (напр. «Адміністрування» внизу меню) одразу прокручується в центр — його папки
    // видно без ручного скролу. setTimeout + 'auto': працює й у фоновій вкладці.
    if (opening && groupEl) {
      setTimeout(() => groupEl.scrollIntoView({ block: 'center', behavior: 'auto' }), 0);
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="md:hidden flex items-center justify-between h-14 px-4 border-b border-gray-200 bg-white sticky top-0 z-50 print:hidden">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white text-xs font-bold">
          П
        </div>
        <span className="text-base font-semibold text-gray-900 tracking-tight">
          ПОСИЛОЧКА
        </span>
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button className="p-2 -mr-2 text-gray-600 hover:text-gray-900" aria-label="Відкрити меню">
              <Menu className="w-6 h-6" aria-hidden="true" />
            </button>
          }
        />
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetTitle className="flex items-center h-14 px-5 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white text-xs font-bold">
                П
              </div>
              <span className="text-base font-semibold text-gray-900 tracking-tight">
                ПОСИЛОЧКА
              </span>
            </div>
          </SheetTitle>

          {/* ТЗ docx 04.11.26 (п.9): меню смартфона — як у комп'ютері, з тим же
              функціоналом, тож і швидкий пошук посилок/клієнтів тут теж. */}
          <div className="px-3 pt-3 shrink-0">
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('q') as HTMLInputElement | null;
                setOpen(false);
                goToSearch(input?.value ?? '');
              }}
            >
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                name="q"
                type="search"
                enterKeyHint="search"
                placeholder="Пошук посилок, клієнтів..."
                className="w-full pl-8 pr-2 py-2 text-base border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all placeholder:text-gray-400"
              />
            </form>
          </div>

          <nav className="flex-1 px-3 py-3 overflow-y-auto">
            {NAV_GROUPS.map((group, gi) => {
              if (group.roles && (!role || !group.roles.includes(role))) return null;
              const visibleItems = group.items.filter(
                item => !item.roles || (role && item.roles.includes(role))
              );
              if (visibleItems.length === 0) return null;

              const hasActiveChild = visibleItems.some(
                item => pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
              );
              const isCollapsible = group.collapsible && !!group.title;
              const isOpen = !isCollapsible || hasActiveChild || openGroups[group.title!];

              return (
                <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
                  {group.title && (
                    isCollapsible ? (
                      <button
                        type="button"
                        onClick={(e) => toggleGroup(group.title!, e.currentTarget.parentElement)}
                        className="w-full flex items-center justify-between px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700"
                      >
                        <span>{group.title}</span>
                        <ChevronDown
                          className={cn('w-3 h-3 transition-transform', isOpen ? 'rotate-0' : '-rotate-90')}
                        />
                      </button>
                    ) : (
                      <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        {group.title}
                      </div>
                    )
                  )}
                  {isOpen && (<div className="space-y-0.5">
                    {visibleItems.map(item => {
                      const isActive = pathname === item.href ||
                        (item.href !== '/' && pathname.startsWith(item.href));
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'group relative flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors',
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
                  </div>)}
                </div>
              );
            })}
          </nav>

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
        </SheetContent>
      </Sheet>
    </div>
  );
}
