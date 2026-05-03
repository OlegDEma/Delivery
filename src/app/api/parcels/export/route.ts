import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth/guards';
import ExcelJS from 'exceljs';
import { kyivDateRange } from '@/lib/utils/tz';
import type { Prisma, ParcelStatus } from '@/generated/prisma/client';

// GET /api/parcels/export?status=...&dateFrom=...&dateTo=...&tripId=...
export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const tripId = searchParams.get('tripId');

  const where: Prisma.ParcelWhereInput = { deletedAt: null };
  if (status) where.status = status as ParcelStatus;
  if (tripId) where.tripId = tripId;
  if (dateFrom || dateTo) {
    try { where.createdAt = kyivDateRange(dateFrom, dateTo); }
    catch { return NextResponse.json({ error: 'Невалідна дата (очікується YYYY-MM-DD)' }, { status: 400 }); }
  }

  const parcels = await prisma.parcel.findMany({
    where,
    include: {
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
      receiverAddress: { select: { city: true, street: true, building: true, npWarehouseNum: true, country: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Посилки');

  // Headers
  const headers = [
    '№', 'ІТН', 'Внутрішній номер', 'Короткий №', 'Напрямок', 'Статус',
    'Відправник', 'Тел. відправника',
    'Отримувач', 'Тел. отримувача', 'Місто отримувача', 'Адреса', 'Склад НП',
    'Місць', 'Вага (кг)', 'Об\'ємна вага (кг)', 'Оголошена вартість',
    'Вартість доставки', 'Загальна вартість',
    'Платник', 'Оплата', 'Пакування', 'Сплачено',
    'Дата створення',
  ];

  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };

  // Data rows
  parcels.forEach((p, i) => {
    ws.addRow([
      i + 1,
      p.itn,
      p.internalNumber,
      p.shortNumber || '',
      p.direction === 'eu_to_ua' ? 'EU→UA' : 'UA→EU',
      p.status,
      `${p.sender.lastName} ${p.sender.firstName}`,
      p.sender.phone,
      `${p.receiver.lastName} ${p.receiver.firstName}`,
      p.receiver.phone,
      p.receiverAddress?.city || '',
      [p.receiverAddress?.street, p.receiverAddress?.building].filter(Boolean).join(' '),
      p.receiverAddress?.npWarehouseNum || '',
      p.totalPlacesCount,
      p.totalWeight ? Number(p.totalWeight) : '',
      p.totalVolumetricWeight ? Number(p.totalVolumetricWeight) : '',
      p.declaredValue ? Number(p.declaredValue) : '',
      p.deliveryCost ? Number(p.deliveryCost) : '',
      p.totalCost ? Number(p.totalCost) : '',
      p.payer === 'sender' ? 'Відправник' : 'Отримувач',
      p.paymentMethod === 'cash' ? 'Готівка' : 'Безготівка',
      p.needsPackaging ? 'Так' : 'Ні',
      p.isPaid ? 'Так' : 'Ні',
      new Date(p.createdAt).toLocaleDateString('uk-UA'),
    ]);
  });

  // Auto-width columns
  ws.columns.forEach(col => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, cell => {
      const len = String(cell.value || '').length;
      if (len > maxLen) maxLen = Math.min(len, 40);
    });
    col.width = maxLen + 2;
  });

  // Generate buffer
  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="parcels-${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  });
}
