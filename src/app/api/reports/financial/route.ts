import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { FINANCE_ROLES } from '@/lib/constants/roles';
import { kyivDateRange, kyivYmd, startOfKyivDay } from '@/lib/utils/tz';
import ExcelJS from 'exceljs';

// GET /api/reports/financial?from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|xlsx
//
// Returns a financial roll-up for the period, in Europe/Kyiv calendar days:
//   - parcel counts (total, by direction, by country)
//   - revenue (paid), pending (unpaid but billable), total billed
//   - cash register sums by currency / payment method / type
//   - daily time-series for charting (revenue & count per day)
//
// Staff-only (FINANCE_ROLES: super_admin, admin, cashier).
export async function GET(request: NextRequest) {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'json').toLowerCase();

  // Default range: current month up to today, Kyiv local.
  const todayYmd = kyivYmd();
  const defaultFrom = todayYmd.slice(0, 8) + '01'; // first day of current month
  const fromYmd = searchParams.get('from') || defaultFrom;
  const toYmd = searchParams.get('to') || todayYmd;

  const range = kyivDateRange(fromYmd, toYmd);
  const createdAtFilter = range;

  // Basic counts & aggregates.
  const [
    parcelsTotal,
    parcelsPaid,
    parcelsUnpaid,
    revenueAgg,
    pendingAgg,
    totalBilledAgg,
    byDirection,
    cashByMethod,
    cashByType,
  ] = await Promise.all([
    prisma.parcel.count({ where: { deletedAt: null, createdAt: createdAtFilter } }),
    prisma.parcel.count({
      where: { deletedAt: null, createdAt: createdAtFilter, isPaid: true, totalCost: { gt: 0 } },
    }),
    prisma.parcel.count({
      where: {
        deletedAt: null,
        createdAt: createdAtFilter,
        isPaid: false,
        totalCost: { gt: 0 },
        status: { notIn: ['draft', 'returned'] },
      },
    }),
    prisma.parcel.aggregate({
      where: { deletedAt: null, createdAt: createdAtFilter, isPaid: true },
      _sum: { totalCost: true },
    }),
    prisma.parcel.aggregate({
      where: {
        deletedAt: null,
        createdAt: createdAtFilter,
        isPaid: false,
        status: { notIn: ['draft', 'returned'] },
      },
      _sum: { totalCost: true },
    }),
    prisma.parcel.aggregate({
      where: { deletedAt: null, createdAt: createdAtFilter, totalCost: { gt: 0 } },
      _sum: { totalCost: true },
    }),
    prisma.parcel.groupBy({
      by: ['direction'],
      where: { deletedAt: null, createdAt: createdAtFilter },
      _count: { _all: true },
      _sum: { totalCost: true, totalWeight: true },
    }),
    prisma.cashRegister.groupBy({
      by: ['currency', 'paymentMethod'],
      where: { createdAt: createdAtFilter },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.cashRegister.groupBy({
      by: ['currency', 'paymentType'],
      where: { createdAt: createdAtFilter },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  // By-country aggregate via trip.country (Parcel doesn't have its own country
  // column — country comes through the trip / origin address). Raw SQL keeps
  // it to a single round-trip.
  const byCountryRaw = await prisma.$queryRaw<{
    country: string | null;
    count: bigint;
    revenue: unknown;
  }[]>`
    SELECT t."country"::text AS country,
           COUNT(*)::bigint AS count,
           COALESCE(SUM(p."total_cost"), 0) AS revenue
    FROM "parcels" p
    LEFT JOIN "trips" t ON t."id" = p."trip_id"
    WHERE p."deleted_at" IS NULL
      AND p."created_at" >= ${range.gte}
      AND p."created_at" <= ${range.lte}
    GROUP BY t."country"
    ORDER BY count DESC
  `;
  const byCountry = byCountryRaw
    .filter((r) => r.country)
    .map((r) => ({
      country: r.country as string,
      count: Number(r.count),
      revenue: Number(r.revenue) || 0,
    }));

  // Daily time-series — raw SQL keeps this single query instead of 30+ counts.
  // We truncate createdAt in Europe/Kyiv so buckets line up with local days.
  const dailySeriesRaw = await prisma.$queryRaw<{
    day: Date;
    count: bigint;
    revenue: unknown;
  }[]>`
    SELECT
      date_trunc('day', "created_at" AT TIME ZONE 'Europe/Kyiv') AT TIME ZONE 'Europe/Kyiv' AS day,
      COUNT(*)::bigint AS count,
      COALESCE(SUM(CASE WHEN "is_paid" = true THEN "total_cost" ELSE 0 END), 0) AS revenue
    FROM "parcels"
    WHERE "deleted_at" IS NULL
      AND "created_at" >= ${range.gte}
      AND "created_at" <= ${range.lte}
    GROUP BY day
    ORDER BY day ASC
  `;

  const dailySeries = dailySeriesRaw.map((r) => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    count: Number(r.count),
    revenue: Number(r.revenue) || 0,
  }));

  const payload = {
    range: { from: fromYmd, to: toYmd },
    totals: {
      parcelsTotal,
      parcelsPaid,
      parcelsUnpaid,
      revenue: Number(revenueAgg._sum.totalCost) || 0,
      pending: Number(pendingAgg._sum.totalCost) || 0,
      totalBilled: Number(totalBilledAgg._sum.totalCost) || 0,
    },
    byDirection: byDirection.map((d) => ({
      direction: d.direction,
      count: d._count._all,
      revenue: Number(d._sum.totalCost) || 0,
      totalWeight: Number(d._sum.totalWeight) || 0,
    })),
    byCountry,
    cashByMethod: cashByMethod.map((c) => ({
      currency: c.currency,
      paymentMethod: c.paymentMethod,
      amount: Number(c._sum.amount) || 0,
      count: c._count._all,
    })),
    cashByType: cashByType.map((c) => ({
      currency: c.currency,
      paymentType: c.paymentType,
      amount: Number(c._sum.amount) || 0,
      count: c._count._all,
    })),
    dailySeries,
  };

  if (format === 'xlsx') {
    return exportExcel(payload);
  }

  return NextResponse.json(payload);
}

async function exportExcel(p: {
  range: { from: string; to: string };
  totals: Record<string, number>;
  byDirection: Array<{ direction: string; count: number; revenue: number; totalWeight: number }>;
  byCountry: Array<{ country: string; count: number; revenue: number }>;
  cashByMethod: Array<{ currency: string; paymentMethod: string; amount: number; count: number }>;
  cashByType: Array<{ currency: string; paymentType: string; amount: number; count: number }>;
  dailySeries: Array<{ day: string; count: number; revenue: number }>;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Delivery';
  workbook.created = new Date();

  // Summary sheet
  const summary = workbook.addWorksheet('Підсумок');
  summary.columns = [
    { header: 'Показник', key: 'name', width: 40 },
    { header: 'Значення', key: 'value', width: 20 },
  ];
  summary.addRows([
    { name: 'Період від', value: p.range.from },
    { name: 'Період до', value: p.range.to },
    { name: '', value: '' },
    { name: 'Всього посилок', value: p.totals.parcelsTotal },
    { name: 'Оплачено', value: p.totals.parcelsPaid },
    { name: 'Не оплачено (до виставлення)', value: p.totals.parcelsUnpaid },
    { name: '', value: '' },
    { name: 'Надходження (EUR)', value: p.totals.revenue },
    { name: 'В очікуванні (EUR)', value: p.totals.pending },
    { name: 'Виставлено всього (EUR)', value: p.totals.totalBilled },
  ]);
  summary.getRow(1).font = { bold: true };

  // By direction
  const dir = workbook.addWorksheet('По напрямках');
  dir.columns = [
    { header: 'Напрямок', key: 'direction', width: 15 },
    { header: 'Посилок', key: 'count', width: 12 },
    { header: 'Виручка, EUR', key: 'revenue', width: 15 },
    { header: 'Вага, кг', key: 'weight', width: 12 },
  ];
  p.byDirection.forEach((d) =>
    dir.addRow({ direction: d.direction, count: d.count, revenue: d.revenue, weight: d.totalWeight }),
  );
  dir.getRow(1).font = { bold: true };

  // By country
  const country = workbook.addWorksheet('По країнах');
  country.columns = [
    { header: 'Країна', key: 'country', width: 15 },
    { header: 'Посилок', key: 'count', width: 12 },
    { header: 'Виручка, EUR', key: 'revenue', width: 15 },
  ];
  p.byCountry.forEach((c) => country.addRow(c));
  country.getRow(1).font = { bold: true };

  // Cash by method
  const cashM = workbook.addWorksheet('Каса (метод)');
  cashM.columns = [
    { header: 'Валюта', key: 'currency', width: 10 },
    { header: 'Метод', key: 'paymentMethod', width: 15 },
    { header: 'Сума', key: 'amount', width: 15 },
    { header: 'Кількість', key: 'count', width: 12 },
  ];
  p.cashByMethod.forEach((c) => cashM.addRow(c));
  cashM.getRow(1).font = { bold: true };

  // Cash by type
  const cashT = workbook.addWorksheet('Каса (тип)');
  cashT.columns = [
    { header: 'Валюта', key: 'currency', width: 10 },
    { header: 'Тип', key: 'paymentType', width: 15 },
    { header: 'Сума', key: 'amount', width: 15 },
    { header: 'Кількість', key: 'count', width: 12 },
  ];
  p.cashByType.forEach((c) => cashT.addRow(c));
  cashT.getRow(1).font = { bold: true };

  // Daily series
  const daily = workbook.addWorksheet('По днях');
  daily.columns = [
    { header: 'Дата', key: 'day', width: 12 },
    { header: 'Посилок', key: 'count', width: 12 },
    { header: 'Виручка, EUR', key: 'revenue', width: 15 },
  ];
  p.dailySeries.forEach((d) => daily.addRow(d));
  daily.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="financial-report-${p.range.from}_${p.range.to}.xlsx"`,
    },
  });
}

// Helper used by `todayYmd` default calculation: start of Kyiv today — noop import
// guard so the module isn't tree-shaken if some caller only wants the helper.
export const __deps = { startOfKyivDay };
