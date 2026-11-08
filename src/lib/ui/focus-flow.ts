/**
 * ТЗ docx 04.11.26 (п.1): «курсор сам переходить до наступного за алгоритмом віконця»
 * у формі створення посилки Працівником (Отримувач → Відправник → Оголошена вартість →
 * Вага → Об'ємна вага).
 *
 * Як це влаштовано: поля алгоритму позначені атрибутом `data-flow`. Їхній порядок — це
 * порядок у DOM, а «гілки» алгоритму (Адресна доставка: Індекс → вулиця → будинок; Пошта:
 * номер складу; Пункт видачі: перша адреса) виходять самі — у формі видно лише поля
 * обраного способу. Тож «наступне віконце» = наступний ВИДИМИЙ і доступний елемент з
 * `data-flow` у тій самій формі. Звідки б Працівник не продовжив (повернувся назад чи
 * клікнув інше поле), далі курсор іде за тим самим порядком (ТЗ: «далі курсор рухається
 * згідно вище поданого алгоритму»).
 *
 * Перехід — клавішею Enter / «Далі» на екранній клавіатурі смартфона (enterKeyHint="next")
 * і після вибору значення у списку (Країна, Спосіб доставки).
 */

export const FLOW_ATTR = 'data-flow';

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden],[inert]')) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return el.getClientRects().length > 0;
}

function isUsable(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled')) return false;
  if ((el as HTMLInputElement).readOnly) return false;
  return isVisible(el);
}

function flowScope(from: Element): ParentNode {
  return from.closest('form') ?? document;
}

/** Наступний елемент алгоритму після `from` (у тій самій формі). */
export function nextFlowElement(from: Element): HTMLElement | null {
  const scope = flowScope(from);
  const all = Array.from(scope.querySelectorAll<HTMLElement>(`[${FLOW_ATTR}]`));
  const anchor = from.closest<HTMLElement>(`[${FLOW_ATTR}]`) ?? (from as HTMLElement);
  const idx = all.indexOf(anchor);
  for (let i = idx + 1; i < all.length; i++) {
    // Випадаючі списки (Країна, Спосіб доставки) у наших формах завжди мають значення за
    // замовчуванням. Курсор їх проходить: на смартфоні фокус на кнопці списку ховає
    // клавіатуру, і «Далі» натиснути вже нема де — ланцюжок обривався б. Змінити значення —
    // дотиком; після вибору курсор сам іде до наступного віконця (focusNextFlowLater).
    if (all[i].getAttribute('aria-haspopup')) continue;
    if (isUsable(all[i])) return all[i];
  }
  return null;
}

/** Поставити курсор у елемент (і прокрутити до нього, якщо він за краєм екрана). */
export function focusFlowElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  return document.activeElement === el;
}

/** Перейти до наступного віконця алгоритму. */
export function focusNextFlow(from: Element | null): boolean {
  if (!from) return false;
  return focusFlowElement(nextFlowElement(from));
}

/**
 * Після вибору у випадаючому списку: даємо списку закритись і формі перемалюватись
 * (напр. зʼявляються поля обраного способу доставки), потім — наступне віконце.
 * setTimeout, а не requestAnimationFrame: rAF стоїть у фоновій вкладці.
 */
export function focusNextFlowLater(from: Element | null, delayMs = 80): void {
  if (!from) return;
  setTimeout(() => focusNextFlow(from), delayMs);
}

/**
 * Обробник Enter для форми (onKeyDown на <form>):
 *  • поле вводу з `data-flow` → не відправляємо форму, а переходимо далі;
 *  • кнопка-вибір (перша адреса пункту видачі) → клік спрацьовує сам, далі — наступне;
 *  • прапорець («Одна посилка») → відмічаємо і переходимо далі;
 *  • кнопка «Зберегти» (`data-flow="save"`) → звичайне натискання (зберігає).
 * Елементи без `data-flow` не чіпаємо — поведінка як і раніше.
 */
export function handleFlowEnter(e: React.KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target as HTMLElement;
  const el = target.closest<HTMLElement>(`[${FLOW_ATTR}]`);
  if (!el || target.tagName === 'TEXTAREA') return;
  if (el.getAttribute(FLOW_ATTR) === 'save') return;

  if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
    e.preventDefault();
    if (!target.checked) target.click();
    focusNextFlowLater(el, 30);
    return;
  }
  if (target.tagName === 'BUTTON' || target.getAttribute('role') === 'button') {
    // Тригер списку (Працівник сам перейшов на нього): Enter — далі, значення вже обрано;
    // відкрити список — дотик / пробіл / стрілка вниз.
    if (target.getAttribute('aria-haspopup')) {
      e.preventDefault();
      focusNextFlow(el);
      return;
    }
    focusNextFlowLater(el, 30);
    return;
  }
  e.preventDefault();
  focusNextFlow(el);
}

/**
 * ТЗ docx 04.11.26 (п.3): незаповнене віконце при «Створити посилку» — курсор у нього і
 * підсвітка. Підсвітку дає `aria-invalid` (стиль полів shadcn: червона рамка); знімаємо
 * її, щойно Працівник почне вводити.
 */
export function focusInvalidField(selector: string): boolean {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;
  const target = el.matches('input,textarea,button,[tabindex]')
    ? el
    : el.querySelector<HTMLElement>('input,textarea,button,[tabindex]') ?? el;
  el.scrollIntoView({ block: 'center', behavior: 'auto' });
  target.focus({ preventScroll: true });
  const marked = el === target ? [el] : [el, target];
  for (const m of marked) m.setAttribute('aria-invalid', 'true');
  const clear = () => marked.forEach((m) => m.removeAttribute('aria-invalid'));
  target.addEventListener('input', clear, { once: true });
  target.addEventListener('click', clear, { once: true });
  return true;
}
