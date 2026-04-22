import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Dashboard routes that are ONLY for internal staff (never clients)
const STAFF_ONLY_PREFIXES = [
  '/parcels',
  '/my-parcels',
  '/clients',
  '/trips',
  '/journeys',
  '/calendar',
  '/routes',
  '/warehouse',
  '/cash-register',
  '/debts',
  '/reports',
  '/analytics',
  '/claims',
  '/search',
  '/scan',
  '/admin',
  '/collection-points',
  // API routes — block clients from calling staff APIs directly
  '/api/parcels',
  '/api/clients',
  '/api/trips',
  '/api/journeys',
  '/api/cash',
  '/api/debts',
  '/api/analytics',
  '/api/stats',
  '/api/claims',
  '/api/users',
  '/api/import',
  '/api/pricing',
  '/api/nova-poshta',
];

// Routes explicitly for clients (the consumer portal)
const CLIENT_ONLY_PREFIXES = ['/my-orders', '/new-order'];

// Public routes — no auth needed
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/tracking',
  '/api/tracking',
  '/api/collection-points',
  '/api/descriptions',
  '/api/client-portal', // registration endpoint uses this
  '/receipt',
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  const isPublicPage = PUBLIC_PREFIXES.some(p => pathname.startsWith(p));

  // 1. Not logged in & accessing protected route → /login
  if (!user && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 2. Logged in & on /login → redirect to role-appropriate home
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = await getHomeForUser(supabase, user.id);
    return NextResponse.redirect(url);
  }

  // 3. Role-based route guard (only for authenticated, non-public requests)
  if (user && !isPublicPage) {
    const role = await getUserRole(supabase, user.id);
    const isApi = pathname.startsWith('/api/');

    // Account deactivated (role returns null when is_active=false) — sign out
    if (role === null) {
      await supabase.auth.signOut();
      if (isApi) {
        return NextResponse.json(
          { error: 'Обліковий запис деактивовано' },
          { status: 401 }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('deactivated', '1');
      return NextResponse.redirect(url);
    }

    // Client trying to access staff area → bounce to /my-orders (or 403 for API)
    if (role === 'client') {
      const isStaffOnly = STAFF_ONLY_PREFIXES.some(p => pathname.startsWith(p)) || pathname === '/';
      if (isStaffOnly) {
        if (isApi) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const url = request.nextUrl.clone();
        url.pathname = '/my-orders';
        return NextResponse.redirect(url);
      }
    } else {
      // Staff trying to use client portal → bounce to /
      const isClientOnly = CLIENT_ONLY_PREFIXES.some(p => pathname.startsWith(p));
      if (isClientOnly) {
        if (isApi) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

async function getUserRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (!data || data.is_active === false) return null;
  return data.role as string;
}

async function getHomeForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<string> {
  const role = await getUserRole(supabase, userId);
  if (role === 'client') return '/my-orders';
  return '/';
}
