import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/validators/common';

/**
 * DELETE /api/service-cities/[id] — admin/super-admin only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  await prisma.serviceCity.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
