import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validators/common';
import { isTerminal } from '@/lib/parcels/status-transitions';
import type { ParcelStatus } from '@/generated/prisma/enums';

/**
 * ТЗ docx 26.10.26 (п.1): фото посилки і нотатку Клієнт додає до СВОГО замовлення —
 * де він Відправник (замовлення з порталу Клієнт завжди оформлює від себе), і поки
 * посилку не доставлено (після «Доставлено» фото видаляються автоматично).
 *
 * Повертає посилку й id профілю або готову відповідь з помилкою.
 */
export async function findOwnOpenOrder(id: string): Promise<
  | { ok: true; userId: string; parcel: { id: string; status: ParcelStatus } }
  | { ok: false; response: NextResponse }
> {
  const fail = (error: string, status: number) => ({ ok: false as const, response: NextResponse.json({ error }, { status }) });
  if (!isUuid(id)) return fail('Невалідний id', 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Unauthorized', 401);

  const profile = await prisma.profile.findUnique({ where: { id: user.id }, select: { phone: true } });
  const client = profile?.phone ? await prisma.client.findUnique({ where: { phone: profile.phone }, select: { id: true } }) : null;
  if (!client) return fail('Посилку не знайдено', 404);

  const parcel = await prisma.parcel.findFirst({
    where: { id, deletedAt: null, senderId: client.id },
    select: { id: true, status: true },
  });
  if (!parcel) return fail('Посилку не знайдено', 404);
  if (isTerminal(parcel.status)) return fail('Посилку вже доставлено — додати фото чи нотатку не можна', 409);
  return { ok: true, userId: user.id, parcel };
}
