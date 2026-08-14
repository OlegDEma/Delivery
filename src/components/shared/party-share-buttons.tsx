'use client';

interface PartyShareButtonsProps {
  /** Телефон сторони (E.164) — адресат WhatsApp/Viber/SMS. */
  phone?: string | null;
  /** Готовий текст підтвердження (зведення посилки). */
  message: string;
  className?: string;
}

/**
 * ТЗ docx 11.08.26 (ЗАГАЛЬНЕ ПРАВИЛО): біля КОЖНОЇ сторони (Отримувач і Відправник)
 * — активні іконки WhatsApp + Viber + SMS для миттєвого надсилання ПІДТВЕРДЖЕННЯ
 * (зведення посилки) на телефон саме цієї сторони. Email прибрано (за ТЗ).
 *
 * Алгоритм (ТЗ): клік по іконці → відкривається відповідна програма з номером цієї
 * особи в адресному рядку і готовим текстом у тілі. Реалізовано deep-link'ом
 * wa.me / viber:// / sms: через ЗВИЧАЙНІ <a> (а не window.open) — window.open('_blank')
 * для схем viber:// та sms: відкривав порожню вкладку і застосунок не запускався.
 */
export function PartyShareButtons({ phone, message, className }: PartyShareButtonsProps) {
  const digits = (phone || '').replace(/\D+/g, '');
  const text = encodeURIComponent(message);

  // WhatsApp: https-лінк wa.me (працює і на мобільному, і у WhatsApp Web).
  const waUrl = digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
  // Viber: chat з номером + текст (мобільний); без номера — forward із текстом.
  const viberUrl = digits ? `viber://chat?number=%2B${digits}&text=${text}` : `viber://forward?text=${text}`;
  // SMS: номер у адресному рядку + текст у тілі (RFC 5724 ?body=).
  const smsUrl = digits ? `sms:+${digits}?body=${text}` : `sms:?body=${text}`;

  const cls = (color: string) =>
    `text-[10px] font-bold ${color} rounded px-1 py-0.5 leading-none no-underline`;

  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className || ''}`}>
      {/* WhatsApp — https, тому нова вкладка. */}
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Надіслати підтвердження у WhatsApp"
        className={cls('text-green-600 hover:text-green-700 border border-green-200')}
      >
        WA
      </a>
      {/* Viber — власна схема, БЕЗ target=_blank (інакше порожня вкладка). */}
      <a
        href={viberUrl}
        title="Надіслати підтвердження у Viber"
        className={cls('text-purple-600 hover:text-purple-700 border border-purple-200')}
      >
        Vb
      </a>
      {/* SMS — власна схема, БЕЗ target=_blank. */}
      <a
        href={smsUrl}
        title="Надіслати підтвердження по SMS"
        className={cls('text-blue-600 hover:text-blue-700 border border-blue-200')}
      >
        SMS
      </a>
    </span>
  );
}
