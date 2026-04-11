import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWarehouses } from '@/lib/nova-poshta/client';

// GET /api/nova-poshta/warehouses?cityRef=xxx&q=1
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cityRef = searchParams.get('cityRef');
  const q = searchParams.get('q');

  if (!cityRef) {
    return NextResponse.json({ error: 'cityRef обов\'язковий' }, { status: 400 });
  }

  try {
    const result = await getWarehouses(cityRef, q || undefined);
    if (!result.success) {
      return NextResponse.json({ error: result.errors.join(', ') }, { status: 400 });
    }

    return NextResponse.json(result.data.map(w => ({
      ref: w.Ref,
      number: w.Number,
      description: w.Description,
      shortAddress: w.ShortAddress,
      phone: w.Phone,
      category: w.CategoryOfWarehouse,
      maxWeight: w.PlaceMaxWeightAllowed,
    })));
  } catch (error) {
    return NextResponse.json({ error: 'Помилка з\'єднання з API НП' }, { status: 500 });
  }
}
