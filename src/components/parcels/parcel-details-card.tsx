'use client';

import { useImperativeHandle, useEffect, useState, type Ref } from 'react';
import { toast } from 'sonner';
import type { ParcelEditHandle } from './parcel-places-card';
import { INSURANCE_AUTO_THRESHOLD_EUR } from '@/lib/constants/insurance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ParcelDetailsCardProps {
  /** Imperative-handle — детальна сторінка відкриває редагування з шапки. */
  ref?: Ref<ParcelEditHandle>;
  parcel: {
    id: string;
    direction: string;
    shipmentType: string;
    description: string | null;
    declaredValue: number | null;
    declaredValueCurrency?: string | null;
    payer: string;
    paymentMethod: string;
    paymentInUkraine: boolean;
    needsPackaging: boolean;
    /** ТЗ docx 12.07.26: read-only маркер «Доставка до порога». */
    doorstepDelivery?: boolean;
    /** Per ТЗ: signal of opted-in insurance (vs deriving from cost > 0). */
    insuranceApplied?: boolean;
    /** «Пакет» — money sender transfers to receiver. Shown as «(N)». */
    parcelMoneyAmount?: number | null;
    isPaid: boolean;
    assignedCourier: { id: string; fullName: string } | null;
    estimatedDeliveryStart: string | null;
    estimatedDeliveryEnd: string | null;
  };
  onUpdate: () => void;
  /** Блокує редагування деталей — після accepted_for_transport_* */
  readOnly?: boolean;
}

export function ParcelDetailsCard({ ref, parcel, onUpdate, readOnly = false }: ParcelDetailsCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [shipmentType, setShipmentType] = useState(parcel.shipmentType || 'parcels_cargo');
  const [description, setDescription] = useState(parcel.description || '');
  const [declaredValue, setDeclaredValue] = useState(parcel.declaredValue ? String(parcel.declaredValue) : '');
  const [payer, setPayer] = useState(parcel.payer);
  const [paymentMethod, setPaymentMethod] = useState(parcel.paymentMethod);
  const [paymentInUkraine, setPaymentInUkraine] = useState(parcel.paymentInUkraine);
  const [needsPackaging, setNeedsPackaging] = useState(parcel.needsPackaging);
  const [insuranceApplied, setInsuranceApplied] = useState(!!parcel.insuranceApplied);
  /**
   * ТЗ docx 21.09.26 (п.4): понад 50 € оголошеної вартості страхування
   * вмикається автоматично (для гривні — еквівалент за курсом НБУ).
   * Аудит 04.10.26: у формах створення/редагування чекбокс уже блокувався, а
   * ось у цій картці його можна було зняти — сервер усе одно нараховував
   * страхування, тож екран суперечив рахунку. Курс тягнемо лише коли він
   * справді потрібен (оголошена вартість у гривнях).
   */
  const [uahPerEur, setUahPerEur] = useState<number | null>(null);
  const declaredIsUah = (parcel.declaredValueCurrency ?? 'EUR') === 'UAH';
  useEffect(() => {
    if (!declaredIsUah || uahPerEur !== null) return;
    let active = true;
    fetch('/api/nbu-rate')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d?.rate) setUahPerEur(Number(d.rate)); })
      .catch(() => {});
    return () => { active = false; };
  }, [declaredIsUah, uahPerEur]);
  const declaredEur = (() => {
    const raw = Number(declaredValue);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (!declaredIsUah) return raw;
    return uahPerEur ? raw / uahPerEur : 0;
  })();
  const insuranceAutoApplied = declaredEur > INSURANCE_AUTO_THRESHOLD_EUR;
  // Stored as string so user can clear the field while editing (per fix
  // applied to admin tariffs editor — `Number('')` would snap back to 0).
  const [parcelMoneyAmount, setParcelMoneyAmount] = useState(
    parcel.parcelMoneyAmount ? String(parcel.parcelMoneyAmount) : ''
  );

  const PAYER_LABELS: Record<string, string> = { sender: 'Відправник', receiver: 'Отримувач' };
  const METHOD_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };
  const SHIPMENT_LABELS: Record<string, string> = {
    parcels_cargo: 'Посилки та вантажі', documents: 'Документи', tires_wheels: 'Шини та диски',
  };

  function startEdit() {
    setShipmentType(parcel.shipmentType || 'parcels_cargo');
    setDescription(parcel.description || '');
    setDeclaredValue(parcel.declaredValue ? String(parcel.declaredValue) : '');
    setPayer(parcel.payer);
    setPaymentMethod(parcel.paymentMethod);
    setPaymentInUkraine(parcel.paymentInUkraine);
    setNeedsPackaging(parcel.needsPackaging);
    setInsuranceApplied(!!parcel.insuranceApplied);
    setParcelMoneyAmount(parcel.parcelMoneyAmount ? String(parcel.parcelMoneyAmount) : '');
    setEditing(true);
  }

  // ТЗ §E4: редагування відкривається ЄДИНОЮ кнопкою «Редагувати» у шапці.
  useImperativeHandle(ref, () => ({
    startEdit: () => { if (!readOnly) startEdit(); },
  }));

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentType,
          description: description || null,
          declaredValue: declaredValue ? Number(declaredValue) : 0,
          payer,
          paymentMethod,
          paymentInUkraine,
          needsPackaging,
          // ТЗ docx 21.09.26 (п.4): понад поріг — страхування йде на сервер як увімкнене.
          insuranceApplied: insuranceApplied || insuranceAutoApplied,
          parcelMoneyAmount: parcelMoneyAmount && Number(parcelMoneyAmount) > 0
            ? Number(parcelMoneyAmount)
            : null,
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
        {/* ТЗ §E4: редагування відкривається ЄДИНОЮ кнопкою «Редагувати» у
            шапці посилки. На картці лишаються тільки «Зберегти»/«Скасувати». */}
        {editing && (
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

        {/* Вид відправлення — ТЗ §E4: при редагуванні повертаємось до полів
            вкладки «Відправлення». ТЗ docx 12.07.26 (п.2): у read-режимі теж
            показуємо рядком (клієнтський підсумок його завжди мав). */}
        {editing ? (
          <div>
            <Label className="text-xs text-gray-500">Вид відправлення</Label>
            <Select value={shipmentType} onValueChange={(v) => setShipmentType(v ?? 'parcels_cargo')}>
              <SelectTrigger className="h-8"><SelectValue>{SHIPMENT_LABELS[shipmentType]}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="parcels_cargo">Посилки та вантажі</SelectItem>
                <SelectItem value="documents">Документи</SelectItem>
                <SelectItem value="tires_wheels">Шини та диски</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-gray-500">Вид відправлення</span>
            <span>{SHIPMENT_LABELS[parcel.shipmentType] || parcel.shipmentType}</span>
          </div>
        )}

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

        {/* Declared value — currency stored per parcel (UAH for UA-sender, EUR otherwise) */}
        {(() => {
          const cur = parcel.declaredValueCurrency || 'EUR';
          const curLabel = cur === 'UAH' ? 'грн' : 'EUR';
          return editing ? (
            <div>
              <Label className="text-xs text-gray-500">Оголошена вартість ({curLabel})</Label>
              <Input type="number" step="0.01" min="0" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} className="text-sm h-8" />
            </div>
          ) : parcel.declaredValue ? (
            <div className="flex justify-between">
              <span className="text-gray-500">Оголошена вартість</span>
              <span>{Number(parcel.declaredValue).toFixed(2)} {curLabel}</span>
            </div>
          ) : null;
        })()}

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

        {/* Payment method.
            Per ТЗ E12: «Форми оплати "Безготівка" відв'язати від Оплата в Україні.
            Тобто і Отримувач і Відправник може оплатити в безготівковій формі
            як в Україні так і в Європі. При відмічанні чекбокса "Оплата в
            Україні" обов'язково встановлюється Безготівка. Готівка неможлива
            у випадку оплати в Україні». */}
        {editing ? (
          <div>
            <Label className="text-xs text-gray-500">Форма оплати</Label>
            <Select value={paymentMethod} onValueChange={(v) => {
              const val = v ?? 'cash';
              // Cash несумісна з «Оплата в Україні» — блокуємо.
              if (val === 'cash' && paymentInUkraine) return;
              setPaymentMethod(val);
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

        {/* Payment in Ukraine — тільки ця галочка примушує Безготівку,
            не навпаки (per ТЗ E12). */}
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

        {/* Insurance — opt-in editable post-creation. Лишається в Деталях,
            бо це єдине місце де користувач може передумати на створеній
            посилці (per ТЗ §10 цей чекбокс живе у вкладці «Відправлення»
            при створенні, але на детальній сторінці tab-структури немає). */}
        {editing ? (
          <label className="flex items-center gap-2 text-sm py-1">
            {/* ТЗ docx 08.10.26: понад поріг (20 €) — вмикається саме і зняти не можна. */}
            <Checkbox
              checked={insuranceApplied || insuranceAutoApplied}
              disabled={insuranceAutoApplied}
              onCheckedChange={(c) => setInsuranceApplied(c === true)}
            />
            Страхування
            {insuranceAutoApplied && (
              <span className="text-xs text-gray-500">
                (обовʼязкове: оголошена вартість понад {INSURANCE_AUTO_THRESHOLD_EUR} €)
              </span>
            )}
          </label>
        ) : parcel.insuranceApplied && (
          <div className="flex justify-between">
            <span className="text-gray-500">Страхування</span>
            <span>Так</span>
          </div>
        )}

        {/* Per ТЗ E11/E12: «Поле "Потребує пакування" забрати». Чекбокс
            «Пакування» більше не редагується тут — тільки read-only-маркер
            показу що послуга застосована. Toggle лишається у формі при
            створенні (вкладка «Відправлення»). */}
        {!editing && parcel.needsPackaging && (
          <div className="flex justify-between">
            <span className="text-gray-500">Пакування</span>
            <span>Так</span>
          </div>
        )}

        {/* ТЗ docx 12.07.26: обраний doorstep видно як атрибут, а не лише як
            рядок надбавки в живому розрахунку (який може не відрендеритись). */}
        {!editing && parcel.doorstepDelivery && (
          <div className="flex justify-between">
            <span className="text-gray-500">Доставка до порога</span>
            <span>Так</span>
          </div>
        )}

        {/* «Пакет» — money transfer. Editable in edit mode, displayed as «(N)»
            in read mode (per ТЗ). */}
        {editing ? (
          <div>
            <Label className="text-xs text-gray-500">Пакет (передача готівки, EUR)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={parcelMoneyAmount}
              onChange={(e) => setParcelMoneyAmount(e.target.value)}
              placeholder="0 = немає"
              className="text-sm h-8"
            />
          </div>
        ) : parcel.parcelMoneyAmount && Number(parcel.parcelMoneyAmount) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Пакет</span>
            <span>({Number(parcel.parcelMoneyAmount).toFixed(0)})</span>
          </div>
        )}

        {/* Read-only fields below */}
        {!editing && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">Оплата</span>
              {/* ТЗ docx 28.09.26: «❌ Ні» червоним читалось як помилка. Показуємо
                  стан тим самим бейджем, що й у списку посилок. */}
              <span
                className={`text-xs font-medium rounded px-1.5 py-0.5 ${
                  parcel.isPaid ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {parcel.isPaid ? 'Оплачено' : 'Не сплачено'}
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
