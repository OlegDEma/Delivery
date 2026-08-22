/** Дата з рядка (YYYY-MM-DD) або null. */
function toDate(v: unknown): Date | null {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Ціле ≥0 або null (порожнє поле). */
function toIntOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Мапимо тіло запиту у поля моделі Vehicle (спільно для POST/PATCH).
 *  Фото-поля тут НЕ чіпаємо — вони керуються окремим ендпоінтом /photo. */
export function mapVehicleBody(body: Record<string, unknown>) {
  return {
    brand: String(body.brand ?? '').trim(),
    model: String(body.model ?? '').trim(),
    regNumber: String(body.regNumber ?? '').trim(),
    // ТЗ docx 21.08.26: загальна к-сть місць (включно з водієм).
    totalSeats: toIntOrNull(body.totalSeats),
    oscpvStart: toDate(body.oscpvStart),
    oscpvEnd: toDate(body.oscpvEnd),
    greenCardStart: toDate(body.greenCardStart),
    greenCardEnd: toDate(body.greenCardEnd),
    techInspectionDate: toDate(body.techInspectionDate),
    nextTechInspectionDate: toDate(body.nextTechInspectionDate),
    notes: body.notes ? String(body.notes) : null,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
  };
}
