'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldHint } from '@/components/shared/field-hint';
import { cn } from '@/lib/utils';
import {
  draftVolumeFields,
  patchFromVolume,
  patchFromVolWeight,
  type PlaceVolumeDraft,
} from '@/lib/parcels/place-volume';

/**
 * ТЗ docx 28.10.26: другий рядок місця — «Об'ємна вага» на місці колишнього
 * «Або об'єм», а «Або об'єм» зсунуто правіше (сітка та сама, що й у рядку
 * Вага/Довжина/Ширина/Висота — віконця стоять одне під одним).
 */
export function PlaceVolumeInputs({
  place,
  onChange,
}: {
  place: PlaceVolumeDraft;
  onChange: (patch: Pick<PlaceVolumeDraft, 'volWeight' | 'volume'>) => void;
}) {
  const fields = draftVolumeFields(place);
  const readOnlyCls = fields.fromDims ? 'bg-gray-50 text-gray-600' : undefined;
  // step="any": значення підставляються автоматично (7,33 кг → 0,0293 м³,
  // 0,0293 м³ → 7,325 кг) і не кратні кроку 0,001/0,01 — з кроком браузер
  // блокував «Створити відправлення» («Please enter a valid value»).
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <div>
        <Label className="text-xs">
          Об&apos;ємна вага (кг){' '}
          <FieldHint text="Можна ввести напряму, без розмірів — об'єм порахується сам (вага ÷ 250). Якщо введено Довжину, Ширину і Висоту — береться об'ємна вага, розрахована з них." />
        </Label>
        <Input
          type="number" inputMode="decimal" step="any" min="0"
          value={fields.volWeight}
          readOnly={fields.fromDims}
          onChange={(e) => onChange(patchFromVolWeight(e.target.value))}
          className={cn('text-base', readOnlyCls)}
        />
      </div>
      <div>
        <Label className="text-xs">
          Або об&apos;єм (м&sup3;){' '}
          <FieldHint text="Якщо об'єм відомий, можна ввести його напряму замість довжини/ширини/висоти — об'ємна вага = об'єм × 250." />
        </Label>
        <Input
          type="number" inputMode="decimal" step="any" min="0"
          value={fields.volume}
          readOnly={fields.fromDims}
          onChange={(e) => onChange(patchFromVolume(e.target.value))}
          className={readOnlyCls}
        />
      </div>
      {fields.fromDims && (
        <div className="col-span-2 self-end pb-1 text-xs text-gray-500">
          Розраховано з Д×Ш×В. Щоб ввести вручну — очистіть розміри.
        </div>
      )}
    </div>
  );
}
