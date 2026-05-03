import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import type { Prisma } from '@/generated/prisma/client';
import { kyivDateRange } from '@/lib/utils/tz';

// GET /api/audit?event=&actorId=&subjectType=&subjectId=&dateFrom=&dateTo=&limit=
//
// Admin-only journal of sensitive operations. Joins actor name in a second
// query (cheaper than a relation include because actorId is nullable and
// often NULL for system events).
export async function GET(request: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const event = searchParams.get('event');
  const actorId = searchParams.get('actorId');
  const subjectType = searchParams.get('subjectType');
  const subjectId = searchParams.get('subjectId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

  const where: Prisma.AuditLogWhereInput = {};
  if (event) where.event = event;
  if (actorId) where.actorId = actorId;
  if (subjectType) where.subjectType = subjectType;
  if (subjectId) where.subjectId = subjectId;
  if (dateFrom || dateTo) {
    try { where.createdAt = kyivDateRange(dateFrom, dateTo); }
    catch { return NextResponse.json({ error: 'Невалідна дата (очікується YYYY-MM-DD)' }, { status: 400 }); }
  }

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const actorIds = Array.from(
    new Set(entries.map((e) => e.actorId).filter((x): x is string => !!x))
  );
  const actors = actorIds.length
    ? await prisma.profile.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true, email: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  // Distinct event list for the filter dropdown. Cheap because indexed.
  const distinctEvents = await prisma.auditLog.findMany({
    distinct: ['event'],
    select: { event: true },
    orderBy: { event: 'asc' },
    take: 200,
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      event: e.event,
      actor: e.actorId ? actorMap.get(e.actorId) ?? null : null,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      payload: e.payload,
      createdAt: e.createdAt,
    })),
    events: distinctEvents.map((d) => d.event),
  });
}
