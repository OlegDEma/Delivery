export const COLLECTION_METHODS = {
  PICKUP_POINT: 'pickup_point',
  COURIER_PICKUP: 'courier_pickup',
  EXTERNAL_SHIPPING: 'external_shipping',
  DIRECT_TO_DRIVER: 'direct_to_driver',
} as const;

export type CollectionMethod = (typeof COLLECTION_METHODS)[keyof typeof COLLECTION_METHODS];

export const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = {
  pickup_point: 'Пункт збору',
  courier_pickup: "Виклик кур'єра",
  external_shipping: 'Сам відправить поштою (PostNL/DPD)',
  direct_to_driver: 'Передати водію',
};

export const COLLECTION_METHOD_HINTS: Record<CollectionMethod, string> = {
  pickup_point:
    'Клієнт привозить посилку у наш пункт збору — найдешевше, зручно для нас',
  courier_pickup:
    'Ми заберемо посилку від клієнта на вказану дату — доплата за виклик',
  external_shipping:
    'Клієнт відправляє посилку сам на нашу адресу локальною поштою',
  direct_to_driver:
    'Клієнт передасть водію напряму у день рейсу',
};

export const COLLECTION_METHOD_ICONS: Record<CollectionMethod, string> = {
  pickup_point: '🏢',
  courier_pickup: '🚐',
  external_shipping: '📦',
  direct_to_driver: '🤝',
};

// Weekdays — aligned with Prisma enum Weekday
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Нд',
};

export const WEEKDAY_LABELS_FULL: Record<Weekday, string> = {
  mon: 'Понеділок',
  tue: 'Вівторок',
  wed: 'Середа',
  thu: 'Четвер',
  fri: 'Пʼятниця',
  sat: 'Субота',
  sun: 'Неділя',
};

/**
 * JS Date.getDay() returns 0..6 where 0 is Sunday.
 * Convert to our Weekday enum.
 */
export function weekdayFromDate(date: Date): Weekday {
  const map: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[date.getDay()];
}

/**
 * Given working days (Weekday[]), find the next date (>= today) when the
 * point accepts parcels. Returns null if workingDays is empty.
 */
export function nextWorkingDay(workingDays: Weekday[], from: Date = new Date()): Date | null {
  if (!workingDays.length) return null;
  const days = new Set<Weekday>(workingDays);
  for (let i = 0; i < 14; i++) {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    if (days.has(weekdayFromDate(d))) return d;
  }
  return null;
}

export function formatWorkingDays(workingDays: Weekday[]): string {
  if (!workingDays.length) return '—';
  const ordered = WEEKDAYS.filter(w => workingDays.includes(w));
  return ordered.map(w => WEEKDAY_LABELS[w]).join(', ');
}
