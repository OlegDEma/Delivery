import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { createClient } from '@supabase/supabase-js';

const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Create SuperAdmin user
  const adminEmail = 'admin@delivery.local';
  const adminPassword = 'admin123456';

  const { data: existingUser } = await supabase.auth.admin.listUsers();
  const alreadyExists = existingUser?.users?.some(u => u.email === adminEmail);

  if (!alreadyExists) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (authError) {
      console.error('Error creating admin user:', authError.message);
      return;
    }

    if (authData.user) {
      await prisma.profile.create({
        data: {
          id: authData.user.id,
          email: adminEmail,
          fullName: 'Суперадмін',
          role: 'super_admin',
        },
      });
      console.log(`SuperAdmin created: ${adminEmail} / ${adminPassword}`);
    }
  } else {
    console.log('SuperAdmin already exists, skipping...');
  }

  // Create default pricing configs (per ТЗ §9–§10).
  //
  // NL: 2€/кг; min: адресна 30€, пункт збору 15€, multi-per-address 15€,
  //     both-directions 15€.
  // AT: 1.5€/кг; min: адресна 15€, пункт збору 10€, multi-per-address 10€,
  //     both-directions 10€.
  //
  // packagingPer10kg / parcelMoneyPercent / insuranceRate — поки 0 за ТЗ
  // (адмін вирішить точні значення; ТЗ зазначає що в Тарифах будуть).
  const existingPricing = await prisma.pricingConfig.findFirst();
  if (!existingPricing) {
    await prisma.pricingConfig.createMany({
      data: [
        {
          country: 'NL',
          direction: 'eu_to_ua',
          pricePerKg: 2.00,
          lvivPricePerKg: 1.50,
          weightType: 'custom',
          collectionDays: ['thursday', 'friday', 'saturday'],
          packagingPrices: { "10": 1, "20": 2, "30": 3, "30+": 5 },
          addressDeliveryPrice: 30.00,
          pickupPointPrice: 15.00,
          minMultiPerAddress: 15.00,
          minBothDirections: 15.00,
        },
        {
          country: 'AT',
          direction: 'eu_to_ua',
          pricePerKg: 1.50,
          lvivPricePerKg: 1.00,
          weightType: 'custom',
          collectionDays: ['friday', 'saturday', 'sunday'],
          packagingPrices: { "10": 1, "20": 2, "30": 3, "30+": 5 },
          addressDeliveryPrice: 15.00,
          pickupPointPrice: 10.00,
          minMultiPerAddress: 10.00,
          minBothDirections: 10.00,
        },
        {
          country: 'NL',
          direction: 'ua_to_eu',
          pricePerKg: 2.00,
          weightType: 'custom',
          collectionDays: ['monday'],
          packagingPrices: { "10": 1, "20": 2, "30": 3, "30+": 5 },
          addressDeliveryPrice: 30.00,
          pickupPointPrice: 15.00,
          minMultiPerAddress: 15.00,
          minBothDirections: 15.00,
        },
        {
          country: 'AT',
          direction: 'ua_to_eu',
          pricePerKg: 1.50,
          weightType: 'custom',
          collectionDays: ['monday'],
          packagingPrices: { "10": 1, "20": 2, "30": 3, "30+": 5 },
          addressDeliveryPrice: 15.00,
          pickupPointPrice: 10.00,
          minMultiPerAddress: 10.00,
          minBothDirections: 10.00,
        },
      ],
    });
    console.log('Default pricing configs created');
  }

  // Initialize yearly sequence
  const currentYear = new Date().getFullYear();
  await prisma.yearlySequence.upsert({
    where: { year: currentYear },
    update: {},
    create: { year: currentYear, lastNumber: 0 },
  });
  console.log(`Yearly sequence initialized for ${currentYear}`);

  // ТЗ (docx 20.06.26): «Виклик кур'єра» та «Пошта» доступні за замовчуванням
  // усюди — НЕ сідимо ServiceCity. Рядки додаються лише як ЗАБОРОНИ через
  // адмінку «Обмеження доступності способів».
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
