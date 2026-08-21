'use client';

interface ContactIconsProps {
  /** Телефон контакта (E.164-ish). */
  phone?: string | null;
  className?: string;
}

/**
 * ТЗ docx 21.08.26 (Маршрути): біля кожного номера в Маршрутному листі — три способи
 * зв'язку з адресатом: мобільний дзвінок, WhatsApp, Viber. Реалізовано deep-link'ами
 * через <a> (tel: / wa.me / viber://) — клік відкриває відповідний застосунок.
 */
export function ContactIcons({ phone, className }: ContactIconsProps) {
  const digits = (phone || '').replace(/\D+/g, '');
  if (!digits) return null;
  const cls = (c: string) => `text-[10px] font-bold ${c} border rounded px-1 py-0.5 leading-none no-underline`;
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className || ''}`} onClick={(e) => e.stopPropagation()}>
      {/* Мобільний дзвінок. */}
      <a href={`tel:+${digits}`} title="Подзвонити" className={cls('text-gray-700 hover:text-gray-900 border-gray-300')}>☎</a>
      {/* WhatsApp — https, нова вкладка. */}
      <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
        className={cls('text-green-600 hover:text-green-700 border-green-200')}>WA</a>
      {/* Viber — власна схема (без target=_blank). */}
      <a href={`viber://chat?number=%2B${digits}`} title="Viber"
        className={cls('text-purple-600 hover:text-purple-700 border-purple-200')}>Vb</a>
    </span>
  );
}
