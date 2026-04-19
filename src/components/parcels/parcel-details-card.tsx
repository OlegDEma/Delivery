'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ParcelDetailsCardProps {
  parcel: {
    id: string;
    direction: string;
    description: string | null;
    declaredValue: number | null;
    payer: string;
    paymentMethod: string;
    paymentInUkraine: boolean;
    needsPackaging: boolean;
    isPaid: boolean;
    assignedCourier: { id: string; fullName: string } | null;
    estimatedDeliveryStart: string | null;
    estimatedDeliveryEnd: string | null;
  };
  onUpdate: () => void;
  /** Блокує редагування деталей — після accepted_for_transport_* */
  readOnly?: boolean;
}

export function ParcelDetailsCard({ parcel, onUpdate, readOnly = false }: ParcelDetailsCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [description, setDescription] = useState(parcel.description || '');
  const [declaredValue, setDeclaredValue] = useState(parcel.declaredValue ? String(parcel.declaredValue) : '');
  const [payer, setPayer] = useState(parcel.payer);
  const [paymentMethod, setPaymentMethod] = useState(parcel.paymentMethod);
  const [paymentInUkraine, setPaymentInUkraine] = useState(parcel.paymentInUkraine);
  const [needsPackaging, setNeedsPackaging] = useState(parcel.needsPackaging);

  const PAYER_LABELS: Record<string, string> = { sender: 'Відправник', receiver: 'Отримувач' };
  const METHOD_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };

  function startEdit() {
    setDescription(parcel.description || '');
    setDeclaredValue(parcel.declaredValue ? String(parcel.declaredValue) : '');
    setPayer(parcel.payer);
    setPaymentMethod(parcel.paymentMethod);
    setPaymentInUkraine(parcel.paymentInUkraine);
    setNeedsPackaging(parcel.needsPackaging);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description || null,
          declaredValue: declaredValue ? Number(declaredValue) : 0,
          payer,
          paymentMethod,
          paymentInUkraine,
          needsPackaging,
        }),
      });
      if (res.ok) {
        toast.success('Збережено');
        setEditing(false);
        onUpdate();
      } else {
        toast.error('Помилка збереження');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Деталі</CardTitle>
        {!editing ? (
          !readOnly && (
            <Button variant="ghost" size="sm" onClick={startEdit} className="text-xs h-7">
              ✏️ Редагувати
            </Button>
          )
        ) : (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="text-xs h-7" disabled={saving}>
              Скасувати
            </Button>
            <Button size="sm" onClick={handleSave} className="text-xs h-7" disabled={saving}>
              {saving ? '...' : 'Зберегти'}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">Напрямок</span>
          <span>{parcel.direction === 'eu_to_ua' ? 'Європа → Україна' : 'Україна → Європа'}</span>
        </div>

        {/* Description */}
        {editing ? (
          <div>
            <Label className="text-xs text-gray-500">Опис</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm" />
          </div>
        ) : parcel.description && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 shrink-0">Опис</span>
            <span className="text-right">{parcel.description}</span>
          </div>
        )}

        {/* Declared value */}
        {editing ? (
          <div>
            <Label className="text-xs text-gray-500">Оголошена вартість (EUR)</Label>
            <Input type="number" step="0.01" min="0" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} className="text-sm h-8" />
          </div>
        ) : parcel.declaredValue ? (
          <div className="flex justify-between">
            <span className="text-gray-500">Оголошена вартість</span>
            <span>{Number(parcel.declaredValue).toFixed(2)} EUR</span>
          </div>
        ) : null}

        {/* Payer */}
        {editing ? (
          <div>
            <Label className="text-xs text-gray-500">Платник</Label>
            <Select value={payer} onValueChange={(v) => setPayer(v ?? 'sender')}>
              <SelectTrigger className="h-8"><SelectValue>{PAYER_LABELS[payer]}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="sender">Відправник</SelectItem>
                <SelectItem value="receiver">Отримувач</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-gray-500">Платник</span>
            <span>{PAYER_LABELS[parcel.payer]}</span>
          </div>
        )}

        {/* Payment method */}
        {editing ? (
          <div>
            <Label className="text-xs text-gray-500">Форма оплати</Label>
            <Select value={paymentMethod} onValueChange={(v) => {
              const val = v ?? 'cash';
              setPaymentMethod(val);
              if (val === 'cashless') setPaymentInUkraine(true);
            }}>
              <SelectTrigger className="h-8"><SelectValue>{METHOD_LABELS[paymentMethod]}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Готівка</SelectItem>
                <SelectItem value="cashless">Безготівка</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-gray-500">Оплата</span>
            <span>
              {METHOD_LABELS[parcel.paymentMethod]}
              {parcel.paymentInUkraine ? ' (в Україні)' : ''}
            </span>
          </div>
        )}

        {/* Payment in Ukraine */}
        {editing && (
          <label className="flex items-center gap-2 text-sm py-1">
            <Checkbox
              checked={paymentInUkraine}
              onCheckedChange={(c) => {
                const val = c === true;
                setPaymentInUkraine(val);
                if (val) setPaymentMethod('cashless');
              }}
            />
            Оплата в Україні
          </label>
        )}

        {/* Needs packaging */}
        {editing ? (
          <label className="flex items-center gap-2 text-sm py-1">
            <Checkbox checked={needsPackaging} onCheckedChange={(c) => setNeedsPackaging(c === true)} />
            Потребує пакування
          </label>
        ) : parcel.needsPackaging && (
          <div className="flex justify-between">
            <span className="text-gray-500">Пакування</span>
            <span>Потребує</span>
          </div>
        )}

        {/* Read-only fields below */}
        {!editing && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">Сплачено</span>
              <span className={parcel.isPaid ? 'text-green-600 font-medium' : 'text-red-600'}>
                {parcel.isPaid ? '✅ Так' : '❌ Ні'}
              </span>
            </div>
            {parcel.assignedCourier && (
              <div className="flex justify-between">
                <span className="text-gray-500">Кур&apos;єр</span>
                <span>{parcel.assignedCourier.fullName}</span>
              </div>
            )}
            {parcel.estimatedDeliveryStart && parcel.estimatedDeliveryEnd && (
              <div className="flex justify-between">
                <span className="text-gray-500">Вікно доставки</span>
                <span>
                  {new Date(parcel.estimatedDeliveryStart).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                  {' — '}
                  {new Date(parcel.estimatedDeliveryEnd).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
