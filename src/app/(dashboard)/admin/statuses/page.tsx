'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { STATUS_TRANSITIONS } from '@/lib/parcels/status-transitions';

// Read-only довідник статусів + матриця переходів. Редагування заборонено —
// статуси визначені в Prisma enum.
//
// ТЗ docx 09.10.26 «Адміністрування/Статуси»: у розділі мають бути лише ці статуси
// і саме в такій послідовності (решту комбінацій «поки що прибрати»).
const FLOW: ParcelStatusType[] = [
  'draft',
  'accepted_for_transport_to_ua',
  'in_transit_to_ua',
  'accepted_for_transport_to_eu',
  'in_transit_to_eu',
];

export default function StatusesPage() {
  const statuses = FLOW;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Статуси посилок</h1>
      <p className="text-sm text-gray-500 mb-4">
        Можливі послідовні варіанти зміни статусів посилки.
        Ці правила застосовуються у «Змінити статус» на сторінці посилки.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {statuses.map((s) => {
          const next = STATUS_TRANSITIONS[s] ?? [];
          return (
            <Card key={s}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    <Badge className={`text-xs ${STATUS_COLORS[s]}`}>{STATUS_LABELS[s]}</Badge>
                  </CardTitle>
                  <span className="font-mono text-[11px] text-gray-400">{s}</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {next.length === 0 ? (
                  <div className="text-xs text-gray-500">Кінцевий статус — переходу далі немає</div>
                ) : (
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5">Можливі наступні статуси:</div>
                    <div className="flex flex-wrap gap-1">
                      {next.map((n) => (
                        <Badge key={n} variant="outline" className={`text-xs ${STATUS_COLORS[n]}`}>
                          {STATUS_LABELS[n]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
