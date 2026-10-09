import { code128Widths } from '@/lib/utils/code128';

/**
 * ТЗ docx 07.10.26: лінійний штрихкод Code 128 (SVG — чіткий на термопринтері).
 * Тиха зона — 10 модулів з кожного боку (вимога стандарту для впевненого скану).
 */
export function Code128({ value, height = 40, className }: { value: string; height?: number; className?: string }) {
  const widths = code128Widths(value);
  const quiet = 10;
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet;
  const bars: { x: number; w: number }[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <svg
      viewBox={`0 0 ${total} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Штрихкод ${value}`}
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={total} height={height} fill="#fff" />
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />)}
    </svg>
  );
}
