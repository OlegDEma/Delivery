/** Дата з рядка (YYYY-MM-DD) або null. */
function toDate(v: unknown): Date | null {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Мапимо тіло запиту у поля моделі Vehicle (спільно для POST/PATCH). */
export function mapVehicleBody(body: Record<string, unknown>) {
  return {
    brand: String(body.brand ?? '').trim(),
    model: String(body.model ?? '').trim(),
    regNumber: String(body.regNumber ?? '').trim(),
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
