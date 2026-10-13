import { formatJourneyNumber } from '@/lib/utils/journey-number';

/**
 * ТЗ docx 04.10.26: «Забрати дату створення посилки» з шапки (і, за рішенням
 * від 05.10.26, зі списків посилок). Номер у БД («13 Rosmalen 1, 03.10.2026»)
 * НЕ змінюємо — він на етикетках і в пошуку; прибираємо дату лише на екрані.
 *
 * ТЗ docx 12.10.26 «Стосовно нумерації посилок»: «Як наскрізну нумерацію лишаємо
 * лише індивідуальні транспортні номери (ІТН). Старі порядкові номери видаляємо.
 * Замість старих порядкових номерів мають стояти внутрішні локальні (однієї
 * поїздки) номери». Тож старий річний порядковий номер («13 …») на екрані не
 * показуємо; якщо посилка вже має номер у поїздці — він стає на його місце
 * («001 Rosmalen 1»).
 */
export function displayParcelNumber(internalNumber: string, journeyNumber?: number | null): string {
  const label = withoutOrdinal(internalNumber).replace(/,\s*\d{2}\.\d{2}\.\d{4}\s*$/, '');
  return journeyNumber != null ? `${formatJourneyNumber(journeyNumber)} ${label}` : label;
}

/**
 * ТЗ docx 12.10.26: старий порядковий номер на початку («13 Rosmalen 1, 03.10.2026» →
 * «Rosmalen 1, 03.10.2026»). Дату лишаємо — там, де її показували й раніше.
 */
export function withoutOrdinal(internalNumber: string): string {
  return internalNumber.replace(/^\d+\s+/, '');
}

/**
 * Підпис посилки в підтвердженні/повідомленні (ТЗ docx 17.08.26 — без суфікса місць:
 * «135 Amstetten 1/2, 17.08.2026» → «Amstetten, 17.08.2026»). ТЗ docx 12.10.26: замість
 * старого порядкового номера — номер у поїздці («001 Amstetten, 17.08.2026»).
 */
export function messageParcelLabel(internalNumber: string, journeyNumber?: number | null): string {
  const label = withoutOrdinal(internalNumber).replace(/\s\d+(?:\/\d+)?,/, ',');
  return journeyNumber != null ? `${formatJourneyNumber(journeyNumber)} ${label}` : label;
}

/**
 * ТЗ docx 12.10.26: повний номер для екранів, де дату показували й раніше (склад,
 * пошук, звіти, етикетка): без старого порядкового номера, з номером у поїздці
 * попереду, якщо він є («001 Rosmalen 1, 03.10.2026»).
 */
export function parcelNumberWithJourney(internalNumber: string, journeyNumber?: number | null): string {
  const label = withoutOrdinal(internalNumber);
  return journeyNumber != null ? `${formatJourneyNumber(journeyNumber)} ${label}` : label;
}
