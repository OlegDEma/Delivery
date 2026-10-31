/**
 * ТЗ docx 26.10.26 (Україна→Європа): відповідь Клієнта на «Ви вже передали своє
 * відправлення «Посилочці»?» пишеться в історію посилки — Працівник бачить, чи посилка вже
 * в нас, чи її ще треба забрати / чекати з пошти. Окремої колонки для неї немає, тож
 * історія — джерело правди і для форми «Редагувати» (відповідь клієнта 30.10.26 до ТЗ
 * 20.10.26: форма редагування не памʼятала відповідь і показувала гілку «Ні»).
 */

const HANDED_OVER_POST = 'Клієнт уже передав посилку Новою поштою';
const HANDED_OVER_COURIER = "Клієнт уже передав посилку кур'єру";
const NOT_HANDED_OVER = 'Клієнт ще не передав посилку';

/** Текст відповіді для історії посилки. */
export function handoverAnswerText(handedOver: boolean, collectionMethod: string | null | undefined): string {
  if (!handedOver) return NOT_HANDED_OVER;
  return collectionMethod === 'external_shipping' ? HANDED_OVER_POST : HANDED_OVER_COURIER;
}

/**
 * Остання відповідь Клієнта з історії посилки (порядок записів будь-який — сортуємо самі).
 * null — відповіді немає (замовлення до 26.10.26 чи оформлене Працівником).
 */
export function readHandedOver(
  history: { notes: string | null; changedAt: Date | string }[],
): boolean | null {
  const sorted = [...history].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  for (const h of sorted) {
    const n = h.notes ?? '';
    if (n.includes(HANDED_OVER_POST) || n.includes(HANDED_OVER_COURIER)) return true;
    if (n.includes(NOT_HANDED_OVER)) return false;
  }
  return null;
}
