import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCities } from '@/lib/nova-poshta/client';

// GET /api/nova-poshta/cities?q=Львів
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const result = await getCities(q);
    if (!result.success) {
      return NextResponse.json({ error: result.errors.join(', ') }, { status: 400 });
    }

    return NextResponse.json(result.data.map(city => ({
      ref: city.Ref,
      name: city.Description,
      area: city.AreaDescription,
      type: city.SettlementTypeDescription,
    })));
  } catch (error) {
    return NextResponse.json({ error: 'Помилка з\'єднання з API НП' }, { status: 500 });
  }
}
