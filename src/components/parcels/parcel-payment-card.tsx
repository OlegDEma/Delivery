'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';

interface ParcelPaymentCardProps {
  parcel: {
    id: string;
    totalCost: number | null;
    declaredValue: number | null;
    paymentMethod: string;
    isPaid: boolean;
    paidAt?: string | null;
    costCurrency?: string;
  };
  onUpdate: () => void;
}

interface PaymentEntry {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentType: string;
  description: string | null;
  createdAt: string;
  receivedBy: { fullName: string } | null;
}

const METHOD_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };

export function ParcelPaymentCard({ parcel, onUpdate }: ParcelPaymentCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PaymentEntry[]>([]);

  // IMPORTANT: payment amount must be the DELIVERY COST (calculated from
  // weight & dimensions), never the declared value. Declared value is what
  // the client says the goods are worth (for insurance/customs) — not what
  // they pay for shipping.
  const defaultAmount = parcel.totalCost ? String(parcel.totalCost) : '';
  const [amount, setAmount] = useState(defaultAmount);
  const [currency, setCurrency] = useState(parcel.costCurrency || 'EUR');
  const [method, setMethod] = useState(parcel.paymentMethod || 'cash');
  const [description, setDescription] = useState('');

  // Reset amount when parcel's totalCost changes (e.g. after recalc)
  useEffect(() => {
    setAmount(parcel.totalCost ? String(parcel.totalCost) : '');
  }, [parcel.totalCost]);

  async function loadHistory() {
    const res = await fetch(`/api/parcels/${parcel.id}/payment`);
    if (res.ok) setHistory(await res.json());
  }

  useEffect(() => {
    loadHistory();
  }, [parcel.id, parcel.isPaid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error('Вкажіть суму');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          currency,
          paymentMethod: method,
          description: description || undefined,
        }),
      });
      if (res.ok) {
        toast.success('Оплату прийнято');
        setDialogOpen(false);
        setDescription('');
        onUpdate();
        loadHistory();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Помилка');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Скасувати оплату? Записи в касі буде видалено.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}/payment`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Оплату скасовано');
        onUpdate();
        loadHistory();
      } else {
        toast.error('Помилка');
      }
    } finally {
      setSaving(false);
    }
  }

  const totalPaid = history
    .filter(h => h.paymentType === 'income')
    .reduce((s, h) => s + Number(h.amount), 0);

  return (
    <>
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">💰 Оплата</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 space-y-2">
          {/* Summary */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">До оплати (вартість послуг)</span>
            <span className="font-semibold">
              {parcel.totalCost
                ? formatCurrency(Number(parcel.totalCost), parcel.costCurrency || 'EUR')
                : 'не розраховано'}
            </span>
          </div>

          {!parcel.totalCost && !parcel.isPaid && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              ⚠️ Вартість послуг ще не розрахована. Перед прийняттям оплати
              вкажіть вагу та розміри у блоці «Місця» — вартість підрахується
              за вагою + пакування + адресна доставка. Оголошена вартість
              ({parcel.declaredValue ? Number(parcel.declaredValue).toFixed(2) + ' EUR' : '—'}) —
              це заявлена вартість речей, а не плата за доставку.
            </div>
          )}

          {/* Status + Action */}
          {parcel.isPaid ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-green-800">
                    ✅ Оплачено {totalPaid > 0 ? formatCurrency(totalPaid, 'EUR') : ''}
                  </div>
                  {parcel.paidAt && (
                    <div className="text-xs text-green-700">
                      {formatDateTime(parcel.paidAt)}
                    </div>
                  )}
                  <div className="text-xs text-green-700">
                    Метод: {METHOD_LABELS[parcel.paymentMethod] || parcel.paymentMethod}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={saving}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Скасувати
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={() => setDialogOpen(true)}
            >
              💰 Прийняти оплату
            </Button>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="border-t pt-2 mt-2">
              <div className="text-xs text-gray-500 mb-1">Історія оплат ({history.length}):</div>
              <div className="space-y-1">
                {history.map(h => (
                  <div key={h.id} className="flex items-start justify-between text-xs bg-gray-50 rounded p-1.5">
                    <div>
                      <div className="font-medium">
                        {h.paymentType === 'income' ? '+' : '-'}{Number(h.amount).toFixed(2)} {h.currency}
                        <span className="text-gray-400 ml-1">({METHOD_LABELS[h.paymentMethod] || h.paymentMethod})</span>
                      </div>
                      {h.description && <div className="text-gray-500">{h.description}</div>}
                    </div>
                    <div className="text-right text-gray-400 shrink-0">
                      <div>{formatDateTime(h.createdAt)}</div>
                      {h.receivedBy && <div>{h.receivedBy.fullName}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accept payment dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Прийняти оплату</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAccept} className="space-y-3">
            {parcel.totalCost ? (
              <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded p-2">
                Вартість послуг (за вагою та розмірами): <b>{formatCurrency(Number(parcel.totalCost), parcel.costCurrency || 'EUR')}</b>
              </div>
            ) : (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ Вартість послуг не розрахована. Введіть суму вручну або
                спершу вкажіть вагу/розміри у блоці «Місця».
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Сума *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  autoFocus
                  className="text-base"
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Валюта</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v ?? 'EUR')}>
                  <SelectTrigger><SelectValue>{currency}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="UAH">UAH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Метод оплати</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
                <SelectTrigger><SelectValue>{METHOD_LABELS[method]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Готівка</SelectItem>
                  <SelectItem value="cashless">Безготівка</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Нотатка (опціонально)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Напр. чек №123, передплата..."
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Збереження...' : 'Підтвердити оплату'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
