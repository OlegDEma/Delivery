import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';

// POST /api/import — import clients or parcels from CSV
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check admin role
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Тільки адмін може імпортувати' }, { status: 403 });
  }

  const body = await request.json();
  const { type, data } = body;

  if (!type || !data || !Array.isArray(data)) {
    return NextResponse.json({ error: 'type та data обов\'язкові' }, { status: 400 });
  }

  if (type === 'clients') {
    let imported = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const row of data) {
      try {
        const phone = String(row.phone || row['телефон'] || row['Телефон'] || row['Phone'] || '').trim();
        const lastName = String(row.lastName || row['прізвище'] || row['Прізвище'] || row['LastName'] || '').trim();
        const firstName = String(row.firstName || row['імя'] || row["ім'я"] || row['Ім\'я'] || row['FirstName'] || row['Імя'] || '').trim();
        const middleName = String(row.middleName || row['по батькові'] || row['По батькові'] || row['MiddleName'] || '').trim() || null;
        const country = String(row.country || row['країна'] || row['Країна'] || row['Country'] || '').trim().toUpperCase() || null;
        const city = String(row.city || row['місто'] || row['Місто'] || row['City'] || '').trim() || null;
        const street = String(row.street || row['вулиця'] || row['Вулиця'] || row['Street'] || '').trim() || null;
        const building = String(row.building || row['будинок'] || row['Будинок'] || row['Building'] || '').trim() || null;
        const notes = String(row.notes || row['нотатки'] || row['Нотатки'] || row['Notes'] || '').trim() || null;

        if (!phone || !firstName || !lastName) {
          skipped++;
          errors.push(`Рядок пропущено: немає телефону/імені/прізвища (${phone || 'без телефону'})`);
          continue;
        }

        // Check duplicate
        const existing = await prisma.client.findUnique({ where: { phone } });
        if (existing) {
          skipped++;
          continue;
        }

        // Normalize country code
        let countryCode: 'UA' | 'NL' | 'AT' | 'DE' | null = null;
        if (country) {
          const map: Record<string, 'UA' | 'NL' | 'AT' | 'DE'> = {
            'UA': 'UA', 'УКРАЇНА': 'UA', 'UKRAINE': 'UA',
            'NL': 'NL', 'НІДЕРЛАНДИ': 'NL', 'NETHERLANDS': 'NL',
            'AT': 'AT', 'АВСТРІЯ': 'AT', 'AUSTRIA': 'AT',
            'DE': 'DE', 'НІМЕЧЧИНА': 'DE', 'GERMANY': 'DE',
          };
          countryCode = map[country] || null;
        }

        await prisma.client.create({
          data: {
            phone,
            phoneNormalized: normalizePhone(phone),
            firstName: capitalize(firstName),
            lastName: capitalize(lastName),
            middleName: middleName ? capitalize(middleName) : null,
            country: countryCode,
            notes,
            addresses: city ? {
              create: {
                country: countryCode || 'UA',
                city,
                street,
                building,
              },
            } : undefined,
          },
        });
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Невідома помилка';
        errors.push(msg);
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      total: data.length,
      errors: errors.slice(0, 20), // max 20 errors
    });
  }

  return NextResponse.json({ error: `Невідомий тип: ${type}` }, { status: 400 });
}
