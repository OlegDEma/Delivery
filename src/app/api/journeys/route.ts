import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Country, TripStatus } from '@/generated/prisma/client';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { LOGISTICS_ROLES } from '@/lib/constants/roles';
import { autoAdvanceTrips } from '@/lib/services/trip-status';

// GET /api/journeys — staff only
export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  // ТЗ L3e: авто-перехід статусів рейсів за датою перед видачею.
  await autoAdvanceTrips();

  const journeys = await prisma.journey.findMany({
    include: {
      assignedCourier: { select: { id: true, fullName: true } },
      secondCourier: { select: { id: true, fullName: true } },
      trips: {
        select: {
          id: true, direction: true, status: true, departureDate: true,
          _count: { select: { parcels: true } },
        },
      },
      _count: { select: { trips: true } },
    },
    orderBy: { departureDate: 'desc' },
    take: 50,
  });

  return NextResponse.json(journeys);
}

// ТЗ docx 14.05.26: створення поїздки по датах АБО по днях тижня + циклічність.
const WEEKDAY_TO_DOW: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** Перша дата ≥ from, що припадає на потрібний день тижня (0=Нд..6=Сб). */
function nextWeekdayOnOrAfter(from: Date, dow: number): Date {
  const d = new Date(from);
  const diff = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

const CYCLIC_WEEKS: Record<string, number> = { '3m': 13, '6m': 26, '1y': 52 };

// POST /api/journeys — create journey(s) + auto-create 2 trips each (logistics roles)
export async function POST(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;
  const user = { id: guard.user.userId };

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }
  const {
    country, scheduleMode,
    departureDate, euArrivalDate, euReturnDate, endDate,
    weekdays, weekdayStart,
    cyclic, cyclicPeriod,
  } = body;

  if (!country || !['UA', 'NL', 'AT', 'DE'].includes(country)) {
    return NextResponse.json({ error: 'Невалідна країна (UA/NL/AT/DE)' }, { status: 400 });
  }

  // ── Базовий тиждень: 4 дати (виїзд UA → приїзд EU → виїзд EU → приїзд UA) ──
  let baseDeparture: Date;
  let baseEuArrival: Date | null = null;
  let baseEuReturn: Date | null = null;
  let baseEnd: Date | null = null;

  if (scheduleMode === 'weekdays') {
    // ТЗ L3b: створення по днях тижня. Прив'язка — «Перший тиждень з».
    const anchor = weekdayStart ? new Date(weekdayStart) : new Date();
    if (Number.isNaN(anchor.getTime())) {
      return NextResponse.json({ error: 'Невалідна дата початку (тиждень з)' }, { status: 400 });
    }
    const depWd = weekdays?.departure;
    if (!depWd || !(depWd in WEEKDAY_TO_DOW)) {
      return NextResponse.json({ error: 'Оберіть день тижня виїзду з України' }, { status: 400 });
    }
    baseDeparture = nextWeekdayOnOrAfter(anchor, WEEKDAY_TO_DOW[depWd]);
    if (weekdays?.euArrival in WEEKDAY_TO_DOW) baseEuArrival = nextWeekdayOnOrAfter(baseDeparture, WEEKDAY_TO_DOW[weekdays.euArrival]);
    const afterArrival = baseEuArrival ?? baseDeparture;
    if (weekdays?.euReturn in WEEKDAY_TO_DOW) baseEuReturn = nextWeekdayOnOrAfter(afterArrival, WEEKDAY_TO_DOW[weekdays.euReturn]);
    const afterReturn = baseEuReturn ?? afterArrival;
    if (weekdays?.end in WEEKDAY_TO_DOW) baseEnd = nextWeekdayOnOrAfter(afterReturn, WEEKDAY_TO_DOW[weekdays.end]);
  } else {
    // Режим по датах.
    if (!departureDate) {
      return NextResponse.json({ error: 'Дата виїзду обов\'язкова' }, { status: 400 });
    }
    for (const [field, val] of [
      ['departureDate', departureDate], ['euArrivalDate', euArrivalDate],
      ['euReturnDate', euReturnDate], ['endDate', endDate],
    ]) {
      if (val && Number.isNaN(new Date(val as string).getTime())) {
        return NextResponse.json({ error: `Невалідна дата: ${field}` }, { status: 400 });
      }
    }
    baseDeparture = new Date(departureDate);
    baseEuArrival = euArrivalDate ? new Date(euArrivalDate) : null;
    baseEuReturn = euReturnDate ? new Date(euReturnDate) : null;
    baseEnd = endDate ? new Date(endDate) : null;
  }

  // ── Кількість тижнів: 1 (без циклічності) або N тижнів за періодом ──
  const weeks = cyclic ? (CYCLIC_WEEKS[cyclicPeriod as string] ?? 13) : 1;

  // Створюємо поїздки тиждень за тижнем (дати зсуваються на 7×k днів).
  // Водії/транспорт/примітки тут НЕ заповнюються (ТЗ L3d: «друга частина» —
  // вноситься при відкритті вже створеної поїздки).
  const created = [];
  for (let k = 0; k < weeks; k++) {
    const shift = k * 7;
    const dep = addDays(baseDeparture, shift);
    const euArr = baseEuArrival ? addDays(baseEuArrival, shift) : null;
    const euRet = baseEuReturn ? addDays(baseEuReturn, shift) : null;
    const end = baseEnd ? addDays(baseEnd, shift) : null;

    const journey = await prisma.journey.create({
      data: {
        country: country as Country,
        departureDate: dep,
        euArrivalDate: euArr,
        euReturnDate: euRet,
        endDate: end,
        createdById: user.id,
      },
    });
    await prisma.trip.createMany({
      data: [
        { direction: 'ua_to_eu', country: country as Country, departureDate: dep, arrivalDate: euArr, journeyId: journey.id, createdById: user.id },
        { direction: 'eu_to_ua', country: country as Country, departureDate: euRet ?? dep, arrivalDate: end, journeyId: journey.id, createdById: user.id },
      ],
    });
    created.push(journey);
  }

  return NextResponse.json({ count: created.length, first: created[0] }, { status: 201 });
}

// PATCH /api/journeys?id=xxx — logistics roles only
export async function PATCH(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id обов\'язковий' }, { status: 400 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.status !== undefined) data.status = body.status as TripStatus;
  if (body.assignedCourierId !== undefined) data.assignedCourierId = body.assignedCourierId || null;
  if (body.secondCourierId !== undefined) data.secondCourierId = body.secondCourierId || null;
  if (body.euArrivalDate !== undefined) data.euArrivalDate = body.euArrivalDate ? new Date(body.euArrivalDate) : null;
  if (body.euReturnDate !== undefined) data.euReturnDate = body.euReturnDate ? new Date(body.euReturnDate) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  // ТЗ L3d: транспорт — «друга частина», вноситься при редагуванні поїздки.
  if (body.vehicleInfo !== undefined) data.vehicleInfo = body.vehicleInfo || null;
  if (body.notes !== undefined) data.notes = body.notes || null;

  const updated = await prisma.journey.update({
    where: { id },
    data,
    include: { trips: true },
  });

  // Синк статус/водіїв/транспорту на дочірні рейси.
  if (
    body.status !== undefined || body.assignedCourierId !== undefined ||
    body.secondCourierId !== undefined || body.vehicleInfo !== undefined
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tripSync: any = {};
    if (body.assignedCourierId !== undefined) tripSync.assignedCourierId = body.assignedCourierId || null;
    if (body.secondCourierId !== undefined) tripSync.secondCourierId = body.secondCourierId || null;
    if (body.vehicleInfo !== undefined) tripSync.vehicleInfo = body.vehicleInfo || null;
    if (Object.keys(tripSync).length > 0) {
      await prisma.trip.updateMany({ where: { journeyId: id }, data: tripSync });
    }
  }

  return NextResponse.json(updated);
}
