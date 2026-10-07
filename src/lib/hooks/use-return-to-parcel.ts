'use client';

import { useEffect, useState } from 'react';

/**
 * ТЗ docx 04.10.26: «Якщо Працівник у розділі „Посилки“ або „Мої посилки“ зайде
 * у якусь посилку, то після виходу з неї назад у загальний список посилок він
 * повинен бачити в центрі екрану саме ту посилку, у яку він щойно заходив.
 * Вона має бути підсвічена.»
 *
 * Перед переходом у посилку запамʼятовуємо її id (sessionStorage), а коли список
 * знову завантажився — прокручуємо рядок `[data-parcel-id]` у центр і на кілька
 * секунд підсвічуємо. setTimeout + behavior:'auto' (не rAF/smooth) — щоб скрол
 * спрацьовував і у фоновій вкладці (див. досвід ТЗ 09.07.26 з авто-фокусом рейсу).
 */
const HIGHLIGHT_MS = 4000;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function rememberOpenedParcel(key: string, parcelId: string) {
  try { storage()?.setItem(key, parcelId); } catch { /* приватний режим — не критично */ }
}

export function useReturnToParcel(key: string, ready: boolean): string | null {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const id = storage()?.getItem(key);
    if (!id) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => {
      // Одноразово: інакше «застарілий» id прокрутив би список несподівано пізніше.
      try { storage()?.removeItem(key); } catch { /* ignore */ }
      const el = document.querySelector<HTMLElement>(`[data-parcel-id="${CSS.escape(id)}"]`);
      // Посилки немає у поточному списку (інший фільтр/видалена) — нічого не робимо.
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
      setHighlightedId(id);
      timers.push(setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS));
    }, 50));
    return () => timers.forEach(clearTimeout);
  }, [key, ready]);

  return highlightedId;
}

/** Збережений стан списку (фільтри, сторінка) — на час сесії вкладки. */
export function readListState<T>(key: string): Partial<T> | null {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function saveListState<T>(key: string, state: T) {
  try { storage()?.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
}
