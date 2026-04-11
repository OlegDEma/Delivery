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

  // Create default pricing configs
  const existingPricing = await prisma.pricingConfig.findFirst();
  if (!existingPricing) {
    await prisma.pricingConfig.createMany({
      data: [
        {
          country: 'NL',
          direction: 'eu_to_ua',
          pricePerKg: 5.00,
          weightType: 'actual',
          collectionDays: ['thursday', 'friday', 'saturday'],
          packagingPrices: { "10": 1, "20": 2, "30": 3, "30+": 5 },
          addressDeliveryPrice: 5.00,
        },
        {
          country: 'AT',
          direction: 'eu_to_ua',
          pricePerKg: 5.00,
          weightType: 'actual',
          collectionDays: ['friday', 'saturday', 'sunday'],
          packagingPrices: { "10": 1, "20": 2, "30": 3, "30+": 5 },
          addressDeliveryPrice: 5.00,
        },
        {
          country: 'NL',
          direction: 'ua_to_eu',
          pricePerKg: 5.00,
          weightType: 'actual',
          collectionDays: ['monday'],
          packagingPrices: { "10": 1, "20": 2, "30": 3, "30+": 5 },
          addressDeliveryPrice: 5.00,
        },
        {
          country: 'AT',
          direction: 'ua_to_eu',
          pricePerKg: 5.00,
          weightType: 'actual',
          collectionDays: ['monday'],
          packagingPrices: { "10": 1, "20": 2, "30": 3, "30+": 5 },
          addressDeliveryPrice: 5.00,
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
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
