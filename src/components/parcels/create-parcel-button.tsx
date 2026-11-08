import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * ТЗ docx 04.11.26 (п.4): «Кнопка, покликана відкрити форму для створення посилки,
 * повинна бути уніфікована, себто відображатись в усіх місцях де вона присутня,
 * однаково. Чорна кнопка з написом „Створити“». Раніше було «+ Створити»,
 * «+ Нова», «+ Створити посилку», синє посилання в Маршрутах — тепер один компонент.
 * Та сама кнопка стоїть і на сторінці перегляду посилки — щоб від однієї посилки
 * одразу переходити до створення наступної.
 *
 * `plainAnchor` — звичайний перехід сторінки (Маршрути: форма має заново прочитати
 * префіл-параметри з URL).
 */
export function CreateParcelButton({
  href = '/parcels/new', className, plainAnchor = false,
}: { href?: string; className?: string; plainAnchor?: boolean }) {
  const button = <Button type="button" size="sm" className="px-3">Створити</Button>;
  if (plainAnchor) {
    return <a href={href} className={cn('inline-flex shrink-0', className)}>{button}</a>;
  }
  return (
    <Link href={href} className={cn('inline-flex shrink-0', className)}>{button}</Link>
  );
}
