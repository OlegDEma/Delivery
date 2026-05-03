'use client';

import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface FieldHintProps {
  text: string;
}

/**
 * Info-tooltip rendered into `document.body` via portal — so the tooltip is
 * NOT clipped by ancestor transforms (Dialog/Sheet/etc set `transform` for
 * their open/close animation, which re-anchors `position: fixed` to the
 * transformed ancestor instead of the viewport per CSS spec).
 *
 * No `mounted` state needed: `show` starts false → the `show && pos`
 * gate keeps `createPortal(document.body)` from running on the server,
 * and only fires once the user actually hovers the button on the client.
 */
export function FieldHint({ text }: FieldHintProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLSpanElement>(null);

  const showTooltip = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      let left = rect.left + rect.width / 2;
      const top = rect.top - 8;
      // Clamp horizontal so the 256px-wide tooltip stays in view.
      left = Math.max(140, Math.min(left, window.innerWidth - 140));
      setPos({ top, left });
    }
    setShow(true);
  }, []);

  const tooltip = show && pos ? createPortal(
    <div
      className="fixed z-[99999] bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-relaxed w-64 pointer-events-none"
      style={{
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {text}
      <div
        className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"
      />
    </div>,
    document.body,
  ) : null;

  return (
    <span
      className="relative inline-block ml-1"
      onMouseEnter={showTooltip}
      onMouseLeave={() => setShow(false)}
      onTouchStart={showTooltip}
      onTouchEnd={() => setTimeout(() => setShow(false), 3000)}
    >
      <span
        ref={btnRef}
        className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold inline-flex items-center justify-center cursor-help"
      >
        і
      </span>
      {tooltip}
    </span>
  );
}
