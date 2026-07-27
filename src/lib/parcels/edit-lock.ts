/**
 * ТЗ docx 26.07.26 (п.1): посилку можна РЕДАГУВАТИ (дані Відправника/Отримувача,
 * адреси, спосіб, ваги, послуги тощо) лише поки вона у статусі «Створена»
 * (draft) — і лише тому, хто її створив. Посилка, що вже «Прийнято до
 * перевезення» / «В дорозі» і далі, — заморожена (дані незмінні).
 *
 * Рішення клієнта (26.07.26):
 *  • буквально: редаговна ЛИШЕ у статусі draft;
 *  • лише автор (createdById === поточний користувач);
 *  • super_admin — виняток: може редагувати будь-що (як і раніше).
 *
 * Це джерело істини для UI (детальна/edit-сторінки, party-edit) і API
 * (PATCH /api/parcels/[id]) — щоб правило було однакове скрізь.
 */
export function canEditParcelData(
  parcel: { status: string; createdById: string | null },
  user: { userId: string; role: string },
): boolean {
  if (user.role === 'super_admin') return true;
  return parcel.status === 'draft' && parcel.createdById === user.userId;
}

/** Людський текст причини блокування — для тостів/банерів. */
export function editLockReason(): string {
  return 'Редагувати можна лише посилку у статусі «Створена», і лише її автором.';
}
