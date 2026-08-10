'use client';

import { cn } from '@/lib/utils';

interface MinibusSeatingProps {
  /** Trip.passengerCapacity (зазвичай 6 або 7). */
  capacity: number;
  /** Зайняті місця іншими пасажирами. */
  occupiedSeats: number[];
  /** Обране місце (для пасажира, якого оформляють). */
  value: number | null;
  onChange: (seat: number) => void;
}

/**
 * ТЗ docx 08.08.26: схематичний план мікроавтобуса для вибору місця пасажира.
 *   Ряд 1: водій (зліва по ходу, завжди зайнято) + місце N1 (справа по ходу).
 *   Ряд 2: N2 N3 N4 (зліва направо).   Ряд 3: N5 N6 N7.
 * Клік по вільному місцю обирає його (закреслюється й прив'язується до пасажира);
 * зайняті іншими — заблоковані. 6 місць → N1 недоступне; 7 місць → N1 можна забронювати.
 */
export function MinibusSeating({ capacity, occupiedSeats, value, onChange }: MinibusSeatingProps) {
  // Дозволені місця: 7 місць → N1..N7; 6 (і менше) → починаємо з N2 (N1 недоступне).
  const allowed = capacity >= 7 ? [1, 2, 3, 4, 5, 6, 7] : [2, 3, 4, 5, 6, 7].slice(0, Math.max(0, capacity));
  const isAllowed = (n: number) => allowed.includes(n);
  const isOccupied = (n: number) => occupiedSeats.includes(n) && n !== value;

  function Seat({ n }: { n: number }) {
    const allowedSeat = isAllowed(n);
    const occupied = isOccupied(n);
    const selected = value === n;
    const disabled = !allowedSeat || occupied;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(n)}
        title={!allowedSeat ? 'Місце недоступне для цієї місткості' : occupied ? 'Місце зайняте' : `Обрати місце ${n}`}
        className={cn(
          'h-11 w-full rounded border text-sm font-semibold flex items-center justify-center transition-colors',
          selected && 'bg-blue-600 text-white border-blue-600 line-through',
          !selected && occupied && 'bg-red-50 text-red-400 border-red-200 line-through cursor-not-allowed',
          !selected && !occupied && !allowedSeat && 'bg-gray-100 text-gray-300 border-gray-200 line-through cursor-not-allowed',
          !selected && !occupied && allowedSeat && 'bg-white hover:bg-blue-50 border-gray-300',
        )}
      >
        {n}
      </button>
    );
  }

  return (
    <div className="inline-block">
      <div className="grid grid-cols-3 gap-1.5 w-48">
        {/* Ряд 1: водій (зліва, завжди зайнято) — порожньо — N1 (справа по ходу) */}
        <div className="h-11 rounded border border-gray-300 bg-gray-200 text-gray-500 text-lg flex items-center justify-center line-through" title="Водій (завжди зайнято)">🚗</div>
        <div />
        <Seat n={1} />
        {/* Ряд 2 */}
        <Seat n={2} /><Seat n={3} /><Seat n={4} />
        {/* Ряд 3 */}
        <Seat n={5} /><Seat n={6} /><Seat n={7} />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">🚗 — водій · клікніть вільне місце</p>
    </div>
  );
}
