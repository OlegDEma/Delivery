'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CapitalizeInput } from '@/components/shared/capitalize-input';
import { FieldHint } from '@/components/shared/field-hint';

export interface AddressEditorState {
  deliveryMethod: string; // 'address' | 'np_warehouse' | 'pickup_point'
  postalCode: string;
  city: string;
  street: string;
  building: string;
  landmark: string;
  npWarehouseNum: string;
  pickupPointText: string;
}

export interface AddressEditorProps {
  state: AddressEditorState;
  onChange: (next: Partial<AddressEditorState>) => void;
  /** Optional title above the editor (e.g. "Адреса доставки"). */
  title?: string;
  cityPlaceholder?: string;
  /** Whether to show the delivery-method selector (default true). */
  showDeliveryMethod?: boolean;
}

/**
 * Inline address editor used on both Receiver and Sender blocks of the
 * /parcels/new form. Mirrors the "Новий клієнт" dialog so worker sees the
 * same fields whether they create a new client or edit a chosen one inline.
 *
 * Fields per ТЗ: «Адреса» selector → 3 options (Адресна доставка / Відділення /
 * Пункт збору), Індекс (postal code) before Населений пункт, виразні заголовки.
 */
export function AddressEditor({
  state,
  onChange,
  title,
  cityPlaceholder,
  showDeliveryMethod = true,
}: AddressEditorProps) {
  const dm = state.deliveryMethod || 'address';

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm font-bold text-blue-700 underline underline-offset-4">{children}</p>
  );

  return (
    <div className="space-y-2">
      {title && (
        <Label className="text-xs text-gray-500 font-medium">{title}</Label>
      )}
      {showDeliveryMethod && (
        <div>
          <SectionTitle>Адреса</SectionTitle>
          <Select
            value={dm}
            onValueChange={(v) => onChange({ deliveryMethod: (v ?? 'address') })}
          >
            <SelectTrigger className="h-8">
              <SelectValue>
                {dm === 'np_warehouse' ? 'Відділення' : dm === 'pickup_point' ? 'Пункт збору' : 'Адресна доставка'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="address">Адресна доставка</SelectItem>
              <SelectItem value="np_warehouse">Відділення</SelectItem>
              <SelectItem value="pickup_point">Пункт збору</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="border-l-2 border-blue-100 pl-3 space-y-2">
        {dm === 'address' && <SectionTitle>Адресна доставка</SectionTitle>}
        {dm === 'np_warehouse' && <SectionTitle>Відділення</SectionTitle>}
        {dm === 'pickup_point' && <SectionTitle>Пункт збору</SectionTitle>}

        <div>
          <Label className="text-xs">
            Індекс <FieldHint text="Поштовий код, призначений даній адресі." />
          </Label>
          <Input
            value={state.postalCode}
            onChange={(e) => onChange({ postalCode: e.target.value })}
            placeholder="00-000"
          />
        </div>
        <div>
          <Label className="text-xs">Населений пункт</Label>
          <CapitalizeInput
            value={state.city}
            onChange={(v) => onChange({ city: v })}
            placeholder={cityPlaceholder}
          />
        </div>

        {dm === 'np_warehouse' && (
          <div>
            <Label className="text-xs">Номер складу/поштомату НП</Label>
            <Input
              value={state.npWarehouseNum}
              onChange={(e) => onChange({ npWarehouseNum: e.target.value })}
              placeholder="1"
            />
          </div>
        )}

        {dm === 'pickup_point' && (
          <div>
            <Label className="text-xs">Опис пункту збору</Label>
            <Input
              value={state.pickupPointText}
              onChange={(e) => onChange({ pickupPointText: e.target.value })}
              placeholder="Назва, орієнтир, контакт..."
            />
          </div>
        )}

        {dm === 'address' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Вулиця</Label>
                <CapitalizeInput
                  value={state.street}
                  onChange={(v) => onChange({ street: v })}
                />
              </div>
              <div>
                <Label className="text-xs">Будинок</Label>
                <Input
                  value={state.building}
                  onChange={(e) => onChange({ building: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Орієнтир</Label>
              <Input
                value={state.landmark}
                onChange={(e) => onChange({ landmark: e.target.value })}
                placeholder="Біля магазину..."
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
