import { prisma } from '../src/lib/prisma';

async function main() {
  const configs = await prisma.pricingConfig.findMany({
    orderBy: [{ country: 'asc' }, { direction: 'asc' }],
  });
  for (const c of configs) {
    console.log(`${c.country} ${c.direction} pricePerKg=${c.pricePerKg} isActive=${c.isActive}`);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
