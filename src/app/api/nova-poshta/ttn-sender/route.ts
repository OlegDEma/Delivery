import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { getNpTtnSender } from '@/lib/nova-poshta/client';
import { logger } from '@/lib/logger';

/**
 * ТЗ docx 04.11.26 (п.6): GET /api/nova-poshta/ttn-sender?ttn=59000123456789 —
 * дані Відправника посилки Нової пошти (телефон, прізвище, ім'я, місто, номер
 * відділення) для форми створення посилки до Європи. Лише для Працівників.
 */
export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const ttn = (new URL(request.url).searchParams.get('ttn') ?? '').replace(/\D/g, '');
  if (ttn.length !== 14) {
    return NextResponse.json({ error: 'Номер ТТН — 14 цифр' }, { status: 400 });
  }
  try {
    const sender = await getNpTtnSender(ttn);
    if (!sender) {
      return NextResponse.json({ error: 'Нова пошта не знайшла таку ТТН' }, { status: 404 });
    }
    if (!sender.phone && !sender.lastName) {
      // НП віддала статус, але без персональних даних (ТТН не на наш номер отримувача).
      return NextResponse.json(
        { error: 'Нова пошта не віддала дані Відправника — ця ТТН не на наш номер отримувача' },
        { status: 422 },
      );
    }
    return NextResponse.json(sender);
  } catch (e) {
    logger.error('np.ttn_sender_failed', e, { ttn });
    return NextResponse.json({ error: 'Немає звʼязку з Новою поштою. Спробуйте ще раз.' }, { status: 502 });
  }
}
