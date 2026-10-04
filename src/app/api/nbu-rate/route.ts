import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { getNbuEurRate } from '@/lib/utils/nbu-rate';

/**
 * GET /api/nbu-rate — офіційний курс НБУ (грн за 1 EUR).
 *
 * Потрібен інтерфейсу там, де оголошена вартість введена в гривнях, а правило
 * ТЗ записане в євро — зокрема авто-страхування понад 50 € (ТЗ docx 21.09.26
 * п.4). Сам розрахунок вартості завжди робить сервер (`calculateParcelCost`);
 * тут лише курс, щоб екран міг показати ту саму відповідь до збереження.
 *
 * Якщо НБУ недоступний, `getNbuEurRate()` віддає null — виклик це переживає,
 * інтерфейс просто не блокує чекбокс, а сервер усе одно застосує правило.
 */
export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const rate = await getNbuEurRate();
  return NextResponse.json({ rate });
}
