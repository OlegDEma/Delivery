'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface InvoiceSettings {
  id: string;
  bankName: string | null;
  iban: string | null;
  accountHolder: string | null;
  swift: string | null;
  smsTemplate: string | null;
}

const PLACEHOLDERS_HELP = [
  '{{name}} — Прізвище Ім\'я платника',
  '{{amount}} — сума до оплати (EUR)',
  '{{itn}} — ITN посилки',
  '{{internalNumber}} — внутрішній номер посилки',
  '{{accountHolder}} — отримувач коштів (з реквізитів вище)',
  '{{iban}}, {{bankName}}, {{swift}} — інші реквізити',
];

export default function InvoiceSettingsPage() {
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/admin/invoice-settings');
      if (cancelled) return;
      if (res.ok) {
        const data: InvoiceSettings = await res.json();
        if (!cancelled) setSettings(data);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    const res = await fetch('/api/admin/invoice-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bankName: settings.bankName,
        iban: settings.iban,
        accountHolder: settings.accountHolder,
        swift: settings.swift,
        smsTemplate: settings.smsTemplate,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Збережено');
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || 'Помилка');
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (!settings) return <div className="text-center py-12 text-red-500">Не вдалося завантажити налаштування</div>;

  function update<K extends keyof InvoiceSettings>(field: K, value: InvoiceSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Реквізити для рахунка</h1>
      <p className="text-sm text-gray-500 mb-4">
        Реквізити банку та шаблон SMS-рахунка, який надсилається платнику при
        активації чекбокса «Відправити рахунок» у формі посилки.
      </p>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Банківські реквізити</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <div>
            <Label className="text-xs">Отримувач (Account holder)</Label>
            <Input
              value={settings.accountHolder ?? ''}
              onChange={(e) => update('accountHolder', e.target.value)}
              placeholder="ФОП Іваненко І.І."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Банк</Label>
              <Input
                value={settings.bankName ?? ''}
                onChange={(e) => update('bankName', e.target.value)}
                placeholder="ПриватБанк"
              />
            </div>
            <div>
              <Label className="text-xs">SWIFT / BIC</Label>
              <Input
                value={settings.swift ?? ''}
                onChange={(e) => update('swift', e.target.value)}
                placeholder="PBANUA2X"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">IBAN</Label>
            <Input
              value={settings.iban ?? ''}
              onChange={(e) => update('iban', e.target.value)}
              placeholder="UA00 0000 0000 0000 0000 0000 0000 0"
              className="font-mono"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Шаблон SMS-рахунка</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <Textarea
            value={settings.smsTemplate ?? ''}
            onChange={(e) => update('smsTemplate', e.target.value)}
            rows={6}
            className="font-mono text-sm"
          />
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">Доступні підстановки</summary>
            <ul className="list-disc pl-5 mt-2 space-y-0.5">
              {PLACEHOLDERS_HELP.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </details>
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Збереження…' : 'Зберегти'}
        </Button>
      </div>
    </div>
  );
}
