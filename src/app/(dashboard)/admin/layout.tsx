import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { ADMIN_ROLES } from '@/lib/constants/roles';

/**
 * Server-side guard for /admin/* — non-admin roles redirected to home.
 * Per QA pass: driver could open /admin/pricing via direct URL even though
 * the sidebar didn't show it. Read access leaked admin-only data; PATCH was
 * blocked at API but UI still rendered, creating confusing UX.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true, isActive: true },
  });
  if (!profile || !profile.isActive) redirect('/login');
  if (!(ADMIN_ROLES as readonly string[]).includes(profile.role)) {
    redirect('/');
  }

  return <>{children}</>;
}
