'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CollectionBlock, type CollectionState, type CollectionPointOption } from './collection-block';
import {
  COLLECTION_METHOD_LABELS,
  COLLECTION_METHOD_ICONS,
  formatWorkingDays,
  type CollectionMethod,
  type Weekday,
} from '@/lib/constants/collection';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDate, formatDateTime } from '@/lib/utils/format';

interface ParcelForCollection {
  id: string;
  direction: string;
  status: string;
  collectionMethod: string | null;
  collectionPointId: string | null;
  collectionDate: string | null;
  collectionAddress: string | null;
  collectedAt: string | null;
  collectionPoint: {
    id: string; name: string | null; country: string; city: string; address: string;
    contactPhone: string | null; workingHours: string | null; workingDays: string[];
  } | null;
  collectedBy: { id: string; fullName: string } | null;
  sender: {
    addresses: { country: string }[];
  };
  senderAddress: { country: string | null } | null;
}

interface ParcelCollectionCardProps {
  parcel: ParcelForCollection;
  onUpdate: () => void;
}

export function ParcelCollectionCard({ parcel, onUpdate }: ParcelCollectionCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const [draft, setDraft] = useState<CollectionState>({
    method: (parcel.collectionMethod as CollectionMethod | null) ?? '',
    pointId: parcel.collectionPointId ?? '',
    date: parcel.collectionDate ? parcel.collectionDate.split('T')[0] : '',
    address: parcel.collectionAddress ?? '',
  });

  // Collection flow only applies to EU→UA
  if (parcel.direction !== 'eu_to_ua') {
    return null;
  }

  const senderCountry = parcel.senderAddress?.country || parcel.sender.addresses[0]?.country || null;

  function startEdit() {
    setDraft({
      method: (parcel.collectionMethod as CollectionMethod | null) ?? '',
      pointId: parcel.collectionPointId ?? '',
      date: parcel.collectionDate ? parcel.collectionDate.split('T')[0] : '',
      address: parcel.collectionAddress ?? '',
    });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionMethod: draft.method || null,
          collectionPointId: draft.method === 'pickup_point' ? draft.pointId || null : null,
          collectionDate: draft.date || null,
          collectionAddress: draft.method === 'courier_pickup' ? draft.address || null : null,
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

  async function handleAcceptAtPoint() {
    if (!parcel.collectionPointId) {
      toast.error('Спершу виберіть пункт збору');
      return;
    }
    if (!confirm('Позначити посилку як прийняту на пункті збору?')) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}/accept-at-point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success('Посилку прийнято на пункті');
        onUpdate();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Помилка');
      }
    } finally {
      setAccepting(false);
    }
  }

  async function handleRevertAccept() {
    if (!confirm('Скасувати прийом на пункті? Статус повернеться до «Створена».')) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}/accept-at-point`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Прийом скасовано');
        onUpdate();
      } else {
        toast.error('Помилка');
      }
    } finally {
      setAccepting(false);
    }
  }

  const method = parcel.collectionMethod as CollectionMethod | null;
  const isAtPoint = parcel.status === 'at_collection_point';
  const canAcceptAtPoint =
    !isAtPoint && parcel.status === 'draft' && method === 'pickup_point' && !!parcel.collectionPointId;

  return (
    <Card>
      <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">📥 Спосіб прийому посилки</CardTitle>
        {!editing ? (
          <Button variant="ghost" size="sm" onClick={startEdit} className="text-xs h-7">
            ✏️ Редагувати
          </Button>
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
      <CardContent className="px-3 pb-3 pt-0">
        {editing ? (
          <CollectionBlock
            senderCountry={senderCountry}
            value={draft}
            onChange={setDraft}
          />
        ) : method ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">{COLLECTION_METHOD_ICONS[method]}</span>
              <span className="font-medium">{COLLECTION_METHOD_LABELS[method]}</span>
            </div>

            {parcel.collectionPoint && (
              <Link
                href={`/collection-points/${parcel.collectionPoint.id}`}
                className="block border rounded-md p-2 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant="secondary" className="text-xs">
                    {COUNTRY_LABELS[parcel.collectionPoint.country as CountryCode] || parcel.collectionPoint.country}
                  </Badge>
                  <span className="font-medium">
                    {parcel.collectionPoint.name || `${parcel.collectionPoint.city}, ${parcel.collectionPoint.address}`}
                  </span>
                </div>
                {parcel.collectionPoint.name && (
                  <div className="text-xs text-gray-500">
                    📍 {parcel.collectionPoint.city}, {parcel.collectionPoint.address}
                  </div>
                )}
                {parcel.collectionPoint.contactPhone && (
                  <div className="text-xs text-gray-500">📞 {parcel.collectionPoint.contactPhone}</div>
                )}
                {parcel.collectionPoint.workingDays?.length > 0 && (
                  <div className="text-xs text-gray-500">
                    📅 {formatWorkingDays(parcel.collectionPoint.workingDays as Weekday[])}
                    {parcel.collectionPoint.workingHours ? ` · ${parcel.collectionPoint.workingHours}` : ''}
                  </div>
                )}
              </Link>
            )}

            {parcel.collectionAddress && (
              <div className="text-xs">
                <span className="text-gray-500">Адреса забору:</span>{' '}
                <span>{parcel.collectionAddress}</span>
              </div>
            )}

            {parcel.collectionDate && (
              <div className="text-xs">
                <span className="text-gray-500">Планована дата:</span>{' '}
                <span>{formatDate(parcel.collectionDate)}</span>
              </div>
            )}

            {/* Accepted banner */}
            {isAtPoint && parcel.collectedAt && (
              <div className="bg-green-50 border border-green-200 rounded-md p-2 text-xs text-green-800">
                ✅ Прийнято: {formatDateTime(parcel.collectedAt)}
                {parcel.collectedBy && <> · {parcel.collectedBy.fullName}</>}
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={handleRevertAccept}
                    disabled={accepting}
                    className="text-red-600 hover:underline text-xs"
                  >
                    Скасувати прийом
                  </button>
                </div>
              </div>
            )}

            {/* Action button */}
            {canAcceptAtPoint && (
              <Button
                onClick={handleAcceptAtPoint}
                disabled={accepting}
                size="sm"
                className="w-full bg-green-600 hover:bg-green-700 mt-1"
              >
                {accepting ? '...' : '✅ Прийняти на пункті збору'}
              </Button>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            Спосіб прийому не вказано. Натисніть «Редагувати» щоб додати.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
