'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  errors: string[];
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect separator: tab, semicolon, or comma
  const firstLine = lines[0];
  let separator = ',';
  if (firstLine.includes('\t')) separator = '\t';
  else if (firstLine.split(';').length > firstLine.split(',').length) separator = ';';

  const headers = lines[0].split(separator).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(separator).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] || '';
    });
    rows.push(row);
  }

  return rows;
}

export default function ImportPage() {
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);
    setError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setError('Файл порожній або невірний формат');
        return;
      }
      setData(parsed);
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleImport() {
    if (data.length === 0) return;
    setImporting(true);
    setError('');

    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clients', data }),
    });

    if (res.ok) {
      setResult(await res.json());
    } else {
      const d = await res.json();
      setError(d.error || 'Помилка імпорту');
    }
    setImporting(false);
  }

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Імпорт даних</h1>

      {/* Instructions */}
      <Card className="mb-4">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Імпорт клієнтів з CSV</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 text-sm space-y-2">
          <p>Завантажте CSV файл з клієнтами. Підтримується роздільник: кома, крапка з комою або табуляція.</p>
          <p className="font-medium">Обов&apos;язкові колонки:</p>
          <ul className="list-disc list-inside text-gray-600 space-y-0.5">
            <li><code className="bg-gray-100 px-1 rounded">телефон</code> або <code className="bg-gray-100 px-1 rounded">phone</code> — номер телефону з кодом країни</li>
            <li><code className="bg-gray-100 px-1 rounded">прізвище</code> або <code className="bg-gray-100 px-1 rounded">lastName</code></li>
            <li><code className="bg-gray-100 px-1 rounded">ім&apos;я</code> або <code className="bg-gray-100 px-1 rounded">firstName</code></li>
          </ul>
          <p className="font-medium">Додаткові колонки (опціонально):</p>
          <ul className="list-disc list-inside text-gray-600 space-y-0.5">
            <li><code className="bg-gray-100 px-1 rounded">по батькові</code>, <code className="bg-gray-100 px-1 rounded">країна</code> (UA/NL/AT/DE), <code className="bg-gray-100 px-1 rounded">місто</code>, <code className="bg-gray-100 px-1 rounded">вулиця</code>, <code className="bg-gray-100 px-1 rounded">будинок</code>, <code className="bg-gray-100 px-1 rounded">нотатки</code></li>
          </ul>
          <p className="text-gray-400 text-xs">Дублікати (однаковий телефон) автоматично пропускаються.</p>
        </CardContent>
      </Card>

      {/* Upload */}
      <div className="flex gap-2 items-center mb-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={handleFile}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          Вибрати файл
        </Button>
        {fileName && <span className="text-sm text-gray-600">{fileName} — {data.length} рядків</span>}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>}

      {/* Preview */}
      {data.length > 0 && !result && (
        <>
          <div className="bg-white rounded-lg border overflow-x-auto mb-4">
            <table className="text-sm w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">#</th>
                  {columns.map(col => (
                    <th key={col} className="px-3 py-2 text-left text-xs text-gray-500 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.slice(0, 10).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    {columns.map(col => (
                      <td key={col} className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate">{row[col]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 10 && (
              <div className="text-center py-2 text-xs text-gray-400">...та ще {data.length - 10} рядків</div>
            )}
          </div>

          <Button onClick={handleImport} disabled={importing} className="w-full h-12 text-base">
            {importing ? 'Імпортується...' : `Імпортувати ${data.length} клієнтів`}
          </Button>
        </>
      )}

      {/* Result */}
      {result && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600 mb-1">{result.imported}</div>
              <div className="text-sm text-gray-500">клієнтів імпортовано</div>
            </div>
            <div className="flex justify-center gap-4">
              <Badge variant="secondary">Всього: {result.total}</Badge>
              <Badge className="bg-green-100 text-green-800">Імпортовано: {result.imported}</Badge>
              {result.skipped > 0 && <Badge className="bg-yellow-100 text-yellow-800">Пропущено: {result.skipped}</Badge>}
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium text-red-600 mb-1">Помилки ({result.errors.length}):</div>
                <div className="text-xs text-gray-600 space-y-0.5 max-h-40 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <div key={i}>• {err}</div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <Button variant="outline" onClick={() => { setData([]); setResult(null); setFileName(''); }}>
                Імпортувати ще
              </Button>
              <Button onClick={() => window.location.href = '/clients'}>
                Перейти до клієнтів
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
