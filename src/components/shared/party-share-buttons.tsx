'use client';

interface PartyShareButtonsProps {
  /** Телефон сторони (E.164) — адресат WhatsApp/Viber. */
  phone?: string | null;
  /** Готовий текст підтвердження (зведення посилки). */
  message: string;
  className?: string;
}

/**
 * ТЗ docx 08.08.26 (ЗАГАЛЬНЕ ПРАВИЛО): біля КОЖНОЇ сторони (Отримувач і Відправник)
 * — активні іконки WhatsApp + Viber для миттєвого надсилання ПІДТВЕРДЖЕННЯ (зведення
 * посилки) на телефон саме цієї сторони. Реалізовано deep-link'ом wa.me / viber://
 * з попередньо заповненим текстом (без сторонніх бізнес-API).
 */
export function PartyShareButtons({ phone, message, className }: PartyShareButtonsProps) {
  const digits = (phone || '').replace(/\D+/g, '');

  function openWhatsApp() {
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  function openViber() {
    const url = digits
      ? `viber://chat?number=%2B${digits}&text=${encodeURIComponent(message)}`
      : `viber://forward?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className || ''}`}>
      <button
        type="button"
        onClick={openWhatsApp}
        title="Надіслати підтвердження у WhatsApp"
        className="text-[10px] font-bold text-green-600 hover:text-green-700 border border-green-200 rounded px-1 py-0.5 leading-none"
      >
        WA
      </button>
      <button
        type="button"
        onClick={openViber}
        title="Надіслати підтвердження у Viber"
        className="text-[10px] font-bold text-purple-600 hover:text-purple-700 border border-purple-200 rounded px-1 py-0.5 leading-none"
      >
        Vb
      </button>
    </span>
  );
}
