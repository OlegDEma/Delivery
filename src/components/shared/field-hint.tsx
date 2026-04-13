'use client';

import { useState, useRef, useEffect } from 'react';

interface FieldHintProps {
  text: string;
}

export function FieldHint({ text }: FieldHintProps) {
  const [show, setShow] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (show && tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      if (rect.left < 8) {
        tooltipRef.current.style.left = '0';
        tooltipRef.current.style.transform = 'none';
      }
      if (rect.right > window.innerWidth - 8) {
        tooltipRef.current.style.left = 'auto';
        tooltipRef.current.style.right = '0';
        tooltipRef.current.style.transform = 'none';
      }
    }
  }, [show]);

  return (
    <span className="relative inline-block ml-1">
      <button
        ref={buttonRef}
        type="button"
        className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-xs font-bold inline-flex items-center justify-center hover:bg-blue-100 hover:text-blue-600 transition-colors"
        onClick={() => setShow(!show)}
      >
        і
      </button>
      {show && (
        <>
          {/* Backdrop to close on tap */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setShow(false)} />
          <div
            ref={tooltipRef}
            className="absolute z-[9999] bottom-7 left-1/2 -translate-x-1/2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-relaxed"
          >
            {text}
          </div>
        </>
      )}
    </span>
  );
}
