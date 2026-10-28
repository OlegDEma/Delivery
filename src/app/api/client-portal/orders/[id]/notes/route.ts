import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findOwnOpenOrder } from '@/lib/client-portal/own-order';

// ТЗ docx 04.10.26 (п.3): нотатка Клієнта — до 150 знаків (як поле «Нотатка» у формі).
const CLIENT_NOTE_MAX = 150;

/**
 * POST /api/client-portal/orders/[id]/notes — нотатка Клієнта до свого замовлення.
 *
 * ТЗ docx 26.10.26 (п.1): «створити нотатку має бути у будь-кого, хто створює посилку.
 * Реалізація стандартна» — так само, як «Додати нотатку» у Працівника: запис в історії
 * посилки без зміни статусу (isNote). Нотатки друкуються у «Примітках» списку рейсу.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const own = await findOwnOpenOrder(id);
  if (!own.ok) return own.response;

  const body: { text?: unknown } | null = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) return NextResponse.json({ error: 'Введіть текст нотатки' }, { status: 400 });
  if (text.length > CLIENT_NOTE_MAX) {
    return NextResponse.json({ error: `Нотатка — не більше ${CLIENT_NOTE_MAX} знаків` }, { status: 400 });
  }

  await prisma.parcelStatusHistory.create({
    data: { parcelId: id, status: own.parcel.status, changedById: own.userId, notes: text, isNote: true },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
