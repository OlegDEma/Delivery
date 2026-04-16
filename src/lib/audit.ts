/**
 * Persistent audit log writer — stores important operations in the database
 * so admins can answer "who did what, when" months later.
 *
 * Pairs with logger.audit() which emits a structured console log for
 * operational monitoring. Use both when it matters.
 */

import { prisma } from './prisma';
import { logger } from './logger';

export type AuditSubjectType = 'parcel' | 'client' | 'user' | 'trip' | 'pricing' | 'cash_entry';

export interface AuditEntry {
  event: string;
  actorId?: string | null;
  subjectId?: string | null;
  subjectType?: AuditSubjectType | null;
  payload?: Record<string, unknown> | null;
}

/**
 * Write an audit record. Errors are swallowed and logged — auditing never
 * blocks the main operation (you'd rather lose an audit row than fail the
 * user-facing action because of a log-table issue).
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event: entry.event,
        actorId: entry.actorId ?? null,
        subjectId: entry.subjectId ?? null,
        subjectType: entry.subjectType ?? null,
        payload: (entry.payload ?? null) as never,
      },
    });
  } catch (err) {
    logger.error('audit.write_failed', err, { event: entry.event });
  }
}
