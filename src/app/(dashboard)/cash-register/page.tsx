'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, formatCurrency } from '@/lib/utils/format';

interface CashEntry {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentType: string;
  description: string | null;
  createdAt: string;
  parcel: { internalNumber: string } | null;
  receivedBy: { fullName: string };
}

interface CashTotal {
  currency: string;
  paymentType: string;
  _sum: { amount: number | null };
}

export default function CashRegisterPage() {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [totals, setTotals] = useState<CashTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Form
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentType, setPaymentType] = useState('income');
  const [description, setDescription] = useState('');

  const fetchCash = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const res = await fetch(`/api/cash?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries);
      setTotals(data.totals);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchCash(); }, [fetchCash]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch('/api/cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency, paymentMethod, paymentType, description: description || undefined }),
    });

    if (res.ok) {
      setDialogOpen(false);
      setAmount('');
      setDescription('');
      fetchCash();
    } else {
      const data = await res.json();
      setError(data.error || 'Помилка');
    }
    setSaving(false);
  }

  const CURRENCY_LABELS: Record<string, string> = { EUR: 'EUR', UAH: 'UAH' };
  const PAYMENT_TYPE_LABELS: Record<string, string> = { income: 'Прихід', expense: 'Витрата', refund: 'Повернення' };
  const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };

  // Calculate summary
  const incomeEUR = totals.find(t => t.currency === 'EUR' && t.paymentType === 'income')?._sum.amount || 0;
  const incomeUAH = totals.find(t => t.currency === 'UAH' && t.paymentType === 'income')?._sum.amount || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Каса</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button>+ Запис</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новий запис каси</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Сума</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required className="text-base" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Валюта</Label>
                  <Select value={currency} onValueChange={(v) => setCurrency(v ?? 'EUR')}>
                    <SelectTrigger><SelectValue>{CURRENCY_LABELS[currency]}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="UAH">UAH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Тип</Label>
                  <Select value={paymentType} onValueChange={(v) => setPaymentType(v ?? 'income')}>
                    <SelectTrigger><SelectValue>{PAYMENT_TYPE_LABELS[paymentType]}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Прихід</SelectItem>
                      <SelectItem value="expense">Витрата</SelectItem>
                      <SelectItem value="refund">Повернення</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Спосіб</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v ?? 'cash')}>
                  <SelectTrigger><SelectValue>{PAYMENT_METHOD_LABELS[paymentMethod]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Готівка</SelectItem>
                    <SelectItem value="cashless">Безготівка</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Опис</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="За посилку #..." />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Збереження...' : 'Зберегти'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Прихід EUR</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(Number(incomeEUR), 'EUR')}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Прихід UAH</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(Number(incomeUAH), 'UAH')}</div>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex gap-2 mb-4">
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        <span className="self-center text-gray-400">—</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {entries.map(e => (
            <div key={e.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${e.paymentType === 'income' ? 'text-green-600' : e.paymentType === 'expense' ? 'text-red-600' : 'text-yellow-600'}`}>
                    {e.paymentType === 'income' ? '+' : '-'}{Number(e.amount).toFixed(2)} {e.currency}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {e.paymentMethod === 'cash' ? 'Готівка' : 'Безготівка'}
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {e.description || (e.parcel ? `Посилка ${e.parcel.internalNumber}` : '—')}
                </div>
              </div>
              <div className="text-right text-xs text-gray-400">
                <div>{formatDateTime(e.createdAt)}</div>
                <div>{e.receivedBy.fullName}</div>
              </div>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="text-center py-8 text-gray-500">Немає записів</div>
          )}
        </div>
      )}
    </div>
  );
}
