import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

/**
 * GET / PATCH /api/admin/invoice-settings
 *
 * Singleton row managing the carrier's bank requisites + SMS template
 * used by the invoice pipeline (per ТЗ — «реквізити банку надавача
 * послуг транспортування»). Lives under /admin so only admins/super-admins
 * can edit it; staff with lower roles can read for tooltip preview if
 * needed (currently the consumer is the admin settings page only).
 */

async function loadSettings() {
  // The migration seeds a singleton row, but be tolerant of an empty DB
  // (e.g. fresh dev box that ran prisma migrate but skipped seeds).
  let row = await prisma.invoiceSettings.findFirst({ where: { isSingleton: true } });
  if (!row) {
    row = await prisma.invoiceSettings.create({ data: { isSingleton: true } });
  }
  return row;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const row = await loadSettings();
  return NextResponse.json(row);
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    bankName?: string | null;
    iban?: string | null;
    accountHolder?: string | null;
    swift?: string | null;
    smsTemplate?: string | null;
    uahPerEur?: number | string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  // Trim strings + accept null/empty as "clear field". Cap lengths so a
  // pasted novel doesn't blow up the SMS body silently.
  const norm = (v: string | null | undefined, max: number): string | null => {
    if (v === null || v === undefined) return undefined as never;
    const t = String(v).trim();
    if (!t) return null;
    return t.slice(0, max);
  };

  const row = await loadSettings();
  const updated = await prisma.invoiceSettings.update({
    where: { id: row.id },
    data: {
      ...(body.bankName      !== undefined && { bankName:      norm(body.bankName,       100) }),
      ...(body.iban          !== undefined && { iban:          norm(body.iban,            50) }),
      ...(body.accountHolder !== undefined && { accountHolder: norm(body.accountHolder,  200) }),
      ...(body.swift         !== undefined && { swift:         norm(body.swift,           20) }),
      ...(body.smsTemplate   !== undefined && { smsTemplate:   norm(body.smsTemplate,   1000) }),
      ...(body.uahPerEur     !== undefined && {
        // Курс UAH/EUR: clamp [1, 1000]. Якщо ввели сміття — ігноруємо.
        uahPerEur: (() => {
          const n = Number(body.uahPerEur);
          if (!Number.isFinite(n) || n < 1 || n > 1000) return undefined as never;
          return n;
        })(),
      }),
    },
  });

  return NextResponse.json(updated);
}
