import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findNearestTrip } from '@/lib/parcels/nearest-trip';

/**
 * GET /api/client-portal/nearest-trip?direction=eu_to_ua&country=NL
 *
 * ТЗ docx 04.10.26: посилка Клієнта автоматично прив'язується до найближчого
 * рейсу; якщо рейсу до країни немає взагалі — Клієнт має побачити «Повідомте
 * оператора…». Форма «Нове замовлення» питає це ДО створення, щоб попередити
 * заздалегідь. Віддаємо лише дату й країну рейсу — без водіїв, транспорту тощо.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const direction = searchParams.get('direction');
  const country = searchParams.get('country');
  if ((direction !== 'eu_to_ua' && direction !== 'ua_to_eu') || !country || !['NL', 'AT', 'DE'].includes(country)) {
    return NextResponse.json({ error: 'Невалідні параметри' }, { status: 400 });
  }

  const trip = await findNearestTrip(direction, country);
  return NextResponse.json({
    trip: trip ? { departureDate: trip.departureDate, country: trip.country } : null,
  });
}
