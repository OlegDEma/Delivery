/** ТЗ docx 11.10.26: номер посилки в поїздці для показу — 1 → «001». */
export function formatJourneyNumber(n: number | null | undefined): string {
  return n == null ? '' : String(n).padStart(3, '0');
}
