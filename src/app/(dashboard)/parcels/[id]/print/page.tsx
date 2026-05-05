'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/format';

interface PrintData {
  itn: string;
  internalNumber: string;
  shortNumber: number | null;
  direction: string;
  totalPlacesCount: number;
  totalWeight: number | null;
  declaredValue: number | null;
  declaredValueCurrency?: string | null;
  payer: string;
  paymentMethod: string;
  paymentInUkraine: boolean;
  createdAt: string;
  sender: { firstName: string; lastName: string; phone: string };
  senderAddress: { city: string } | null;
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: { city: string; street: string | null; building: string | null; npWarehouseNum: string | null; country: string } | null;
  places: { placeNumber: number; weight: number | null; itnPlace: string | null; volumetricWeight: number | null }[];
  description: string | null;
  totalCost: number | null;
  createdBy: { fullName: string } | null;
}

export default function PrintLabelPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PrintData | null>(null);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/parcels/${id}`).then(r => r.ok ? r.json() : null).then(setData);
  }, [id]);

  useEffect(() => {
    if (!data) return;
    async function generateQR() {
      const codes: Record<string, string> = {};
      const baseUrl = window.location.origin;
      for (const place of data!.places) {
        const itnCode = place.itnPlace || data!.itn;
        // QR contains URL so any phone camera opens tracking directly
        const qrUrl = `${baseUrl}/tracking?q=${encodeURIComponent(itnCode)}`;
        codes[itnCode] = await QRCode.toDataURL(qrUrl, { width: 100, margin: 1 });
      }
      setQrCodes(codes);
    }
    generateQR();
  }, [data]);

  if (!data) return <div className="text-center py-12">Завантаження...</div>;

  return (
    <div className="p-2">
      {/* Screen controls */}
      <div className="print:hidden mb-4 flex gap-2">
        <Button onClick={() => window.print()}>Друкувати етикетки</Button>
        <Button variant="outline" onClick={() => window.history.back()}>Назад</Button>
      </div>

      {/* Print styles for 58mm thermal printer */}
      <style>{`
        @media print {
          @page { size: 58mm auto; margin: 2mm; }
          body { font-size: 10px !important; }
          .print-label { page-break-after: always; width: 54mm !important; }
          .print-label:last-child { page-break-after: avoid; }
        }
      `}</style>

      {/* Label per place */}
      {data.places.map((place) => {
        const qrKey = place.itnPlace || data.itn;
        return (
          <div key={place.placeNumber} className="print-label border-2 border-black p-2 mb-4 max-w-[58mm] mx-auto text-[10px] leading-tight">
            {/* QR + ITN */}
            <div className="flex items-start gap-1 border-b border-black pb-1 mb-1">
              {qrCodes[qrKey] && (
                <img src={qrCodes[qrKey]} alt="QR" width={70} height={70} className="shrink-0" />
              )}
              <div className="flex-1 text-center">
                <div className="font-mono text-[8px] break-all">{qrKey}</div>
                {data.shortNumber && (
                  <div className="text-[20px] font-bold mt-0.5">#{data.shortNumber}</div>
                )}
              </div>
            </div>

            {/* Internal number - BIG */}
            <div className="text-center font-bold text-[14px] border-b border-dashed pb-1 mb-1">
              {data.internalNumber}
            </div>

            {/* From */}
            <div className="mb-1">
              <div className="font-bold">ВІД:</div>
              <div>{data.sender.lastName} {data.sender.firstName}</div>
              <div>{data.sender.phone}</div>
              {data.senderAddress && <div>{data.senderAddress.city}</div>}
            </div>

            {/* To */}
            <div className="mb-1">
              <div className="font-bold">КОМУ:</div>
              <div>{data.receiver.lastName} {data.receiver.firstName}</div>
              <div>{data.receiver.phone}</div>
              {data.receiverAddress && (
                <div>
                  {data.receiverAddress.city}
                  {data.receiverAddress.street ? `, ${data.receiverAddress.street}` : ''}
                  {data.receiverAddress.building ? ` ${data.receiverAddress.building}` : ''}
                  {data.receiverAddress.npWarehouseNum ? ` | НП №${data.receiverAddress.npWarehouseNum}` : ''}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="border-t border-gray-400 pt-0.5 text-[9px]">
              {data.description && <div>{data.description}</div>}
              <div>
                М: {place.placeNumber}/{data.totalPlacesCount} |
                В: {place.weight ? `${Number(place.weight).toFixed(1)}кг` : '—'}
                {place.volumetricWeight && Number(place.volumetricWeight) > 0 ? ` (об.${Number(place.volumetricWeight).toFixed(1)})` : ''}
              </div>
              <div>
                {data.payer === 'sender' ? 'Від' : 'Отр'} |
                {data.paymentMethod === 'cash' ? 'Гот' : 'Б/г'}
                {data.paymentInUkraine ? ' UA' : ''}
                {data.declaredValue ? ` | Вар: ${Number(data.declaredValue).toFixed(0)}€` : ''}
              </div>
              <div>{formatDate(data.createdAt)}{data.createdBy ? ` | ${data.createdBy.fullName}` : ''}</div>
            </div>
          </div>
        );
      })}

      {/* Full receipt for client (print on separate page) */}
      <div className="print-label border-2 border-black p-2 mb-4 max-w-[58mm] mx-auto text-[10px] leading-tight">
        <div className="text-center font-bold text-[12px] mb-1">КВИТАНЦІЯ</div>
        <div className="text-center font-mono text-[11px] font-bold">{data.internalNumber}</div>
        <div className="text-center text-[8px] mb-1">{data.itn}</div>

        <div className="border-t border-black pt-1 mb-1">
          <div className="font-bold">ВІД:</div>
          <div>{data.sender.lastName} {data.sender.firstName}</div>
          <div>{data.sender.phone}</div>
          {data.senderAddress && <div>{data.senderAddress.city}</div>}
        </div>

        <div className="mb-1">
          <div className="font-bold">КОМУ:</div>
          <div>{data.receiver.lastName} {data.receiver.firstName}</div>
          <div>{data.receiver.phone}</div>
          {data.receiverAddress && (
            <div>
              {data.receiverAddress.city}
              {data.receiverAddress.street ? `, ${data.receiverAddress.street}` : ''}
              {data.receiverAddress.npWarehouseNum ? ` | НП №${data.receiverAddress.npWarehouseNum}` : ''}
            </div>
          )}
        </div>

        <div className="border-t border-black pt-1 mb-1">
          <div className="font-bold">ВІДПРАВЛЕННЯ:</div>
          {data.description && <div>{data.description}</div>}
          <div>Місць: {data.totalPlacesCount}</div>
          <div>Вага: {data.totalWeight ? `${Number(data.totalWeight).toFixed(2)} кг` : '—'}</div>
          {data.declaredValue && <div>Оголошена вартість: {Number(data.declaredValue).toFixed(2)} {data.declaredValueCurrency === 'UAH' ? 'грн' : 'EUR'}</div>}
          <div>Платник: {data.payer === 'sender' ? 'Відправник' : 'Отримувач'}</div>
          <div>Оплата: {data.paymentMethod === 'cash' ? 'Готівка' : 'Безготівка'}{data.paymentInUkraine ? ' (в Україні)' : ''}</div>
          {data.totalCost && <div className="font-bold mt-0.5">Вартість: {Number(data.totalCost).toFixed(2)} EUR</div>}
        </div>

        <div className="border-t border-black pt-1 text-[8px] text-center">
          <div>{formatDate(data.createdAt)}</div>
          <div>Дякуємо за довіру!</div>
        </div>
      </div>
    </div>
  );
}
