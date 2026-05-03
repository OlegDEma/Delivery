import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ParcelStatus } from '@/generated/prisma/client';
import { requireStaff } from '@/lib/auth/guards';
import { isAllowedTransition, isTerminal } from '@/lib/parcels/status-transitions';
import type { ParcelStatusType } from '@/lib/constants/statuses';
import { ROLES } from '@/lib/constants/roles';
import { logger } from '@/lib/logger';

// POST /api/parcels/bulk-status — change status for multiple parcels (staff only)
//
// Per ТЗ: «Статуси що випадають зі списку мають відповідати прийнятим в
// програмі статусам і правилам їх зміни». We MUST validate every transition
// against status-transitions.ts so a bulk operation can't bypass rules a
// single-parcel PATCH would reject. Super_admin can override with ?force=1.
export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const user = { id: guard.user.userId, role: guard.user.role };

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1' && user.role === ROLES.SUPER_ADMIN;

  const body = await request.json();
  const { parcelIds, status, notes } = body;

  if (!parcelIds?.length || !status) {
    return NextResponse.json({ error: 'Вкажіть посилки та статус' }, { status: 400 });
  }

  // Look up current statuses to validate every transition + reject missing IDs.
  const current = await prisma.parcel.findMany({
    where: { id: { in: parcelIds }, deletedAt: null },
    select: { id: true, status: true },
  });
  const currentMap = new Map(current.map(p => [p.id, p.status as ParcelStatusType]));

  // Reject if any requested IDs don't exist — silent skip would mask client bugs.
  const missingIds = (parcelIds as string[]).filter(id => !currentMap.has(id));
  if (missingIds.length > 0) {
    return NextResponse.json({
      error: `Посилок не знайдено: ${missingIds.length}`,
      missing: missingIds.slice(0, 20),
    }, { status: 404 });
  }

  if (!force) {
    const blocked: { id: string; from: ParcelStatusType; reason: string }[] = [];
    for (const id of parcelIds as string[]) {
      const from = currentMap.get(id);
      if (!from) continue;
      if (isTerminal(from)) {
        blocked.push({ id, from, reason: 'terminal' });
      } else if (!isAllowedTransition(from, status as ParcelStatusType)) {
        blocked.push({ id, from, reason: 'not_allowed' });
      }
    }
    if (blocked.length > 0) {
      logger.warn('parcels.bulk_status.blocked', { count: blocked.length, target: status, userId: user.id });
      return NextResponse.json({
        error: `Не дозволено: ${blocked.length} посилок не можуть перейти в "${status}" з поточного статусу`,
        blocked: blocked.slice(0, 20),
      }, { status: 400 });
    }
  }

  // Update all parcels and create status history entries
  const results = await prisma.$transaction(
    parcelIds.map((id: string) =>
      prisma.parcel.update({
        where: { id },
        data: {
          status: status as ParcelStatus,
          statusHistory: {
            create: {
              status: status as ParcelStatus,
              changedById: user.id,
              notes: notes || (force ? 'Масова зміна статусу (force)' : 'Масова зміна статусу'),
            },
          },
        },
      })
    )
  );

  return NextResponse.json({ updated: results.length });
}
