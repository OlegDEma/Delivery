/**
 * ТЗ docx 26.10.26 (Рейс/Друк списку): «У списку посилок у стовпці „Примітки“ друкуються
 * саме Нотатки, які будь-хто може додати при створенні посилки. Це єдина примітка, яка може
 * бути на зараз. Решту — забрати».
 *
 * Нотатки посилки — це нотатка Клієнта з форми замовлення (clientNote) і записи «Додати
 * нотатку» (Працівника чи Клієнта) — у порядку додавання. Коротка «Примітка для списку»
 * (ТЗ 12.10.26) прибрана.
 */

/** Записи історії статусів, які API віддає для «Приміток» (лише нотатки — isNote). */
export interface NoteEntry { notes: string | null }

/** Нотатки одним рядком для стовпчика «Примітки» друкованого списку. */
export function parcelListNote(p: { clientNote?: string | null; statusHistory?: NoteEntry[] | null }): string {
  return [p.clientNote, ...(p.statusHistory ?? []).map((h) => h.notes)]
    .map((s) => (s ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('; ');
}

/** Prisma-вибірка нотаток посилки для «Приміток» (найстаріші — першими). */
export const NOTE_ENTRIES_SELECT = {
  where: { isNote: true },
  orderBy: { changedAt: 'asc' as const },
  select: { notes: true },
};
