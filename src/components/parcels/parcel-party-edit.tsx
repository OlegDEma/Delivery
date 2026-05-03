'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { PhoneInput } from '@/components/shared/phone-input';
import { AddressEditor, type AddressEditorState } from '@/components/parcels/address-editor';
import type { CountryCode } from '@/lib/constants/countries';

interface PartyAddress {
  id?: string | null;
  country?: string | null;
  city?: string | null;
  street?: string | null;
  building?: string | null;
  postalCode?: string | null;
  landmark?: string | null;
  npWarehouseNum?: string | null;
  pickupPointText?: string | null;
  deliveryMethod?: string | null;
}

interface PartyData {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  country?: string | null;
}

export interface ParcelPartyEditProps {
  parcelId: string;
  /** 'sender' | 'receiver' — drives which side of parcel we update. */
  role: 'sender' | 'receiver';
  party: PartyData;
  address: PartyAddress | null;
  /** Called after a successful save so the parent refetches. */
  onSaved: () => void;
}

/**
 * Inline editor for the Receiver/Sender block on /parcels/[id].
 *
 * Per ТЗ: «Можна редагувати лише дані Отримувача або Відправника» — even after
 * the parcel is locked from weight/dimension edits. So this component is shown
 * irrespective of `isEditLocked`.
 *
 * Saves through:
 *  - PATCH /api/clients/[id] action=update — when phone changes
 *  - PATCH /api/clients/[id] action=updateAddress — when address fields change
 *  - PATCH /api/parcels/[id] tripId/etc. is NOT touched here.
 */
export function ParcelPartyEdit({ parcelId, role, party, address, onSaved }: ParcelPartyEditProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(party.phone);
  const [addr, setAddr] = useState<AddressEditorState>({
    deliveryMethod: address?.deliveryMethod || 'address',
    postalCode: address?.postalCode || '',
    city: address?.city || '',
    street: address?.street || '',
    building: address?.building || '',
    landmark: address?.landmark || '',
    npWarehouseNum: address?.npWarehouseNum || '',
    pickupPointText: address?.pickupPointText || '',
  });
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-blue-600 hover:text-blue-800 ml-2 inline-flex items-center"
        title={role === 'receiver' ? 'Редагувати дані Отримувача' : 'Редагувати дані Відправника'}
      >
        <Pencil className="w-3 h-3" />
      </button>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      // 1. Phone changed → update client
      if (phone && phone !== party.phone) {
        const r = await fetch(`/api/clients/${party.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', phone }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || 'Помилка збереження телефону');
        }
      }

      // 2. Address changed → update or create
      const addrChanged =
        addr.deliveryMethod !== (address?.deliveryMethod || 'address') ||
        addr.postalCode !== (address?.postalCode || '') ||
        addr.city !== (address?.city || '') ||
        addr.street !== (address?.street || '') ||
        addr.building !== (address?.building || '') ||
        addr.landmark !== (address?.landmark || '') ||
        addr.npWarehouseNum !== (address?.npWarehouseNum || '') ||
        addr.pickupPointText !== (address?.pickupPointText || '');

      if (addrChanged && address?.id) {
        const r = await fetch(`/api/clients/${party.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'updateAddress',
            addressId: address.id,
            address: {
              deliveryMethod: addr.deliveryMethod,
              postalCode: addr.postalCode || null,
              city: addr.city,
              street: addr.street || null,
              building: addr.building || null,
              landmark: addr.landmark || null,
              npWarehouseNum: addr.npWarehouseNum || null,
              pickupPointText: addr.pickupPointText || null,
            },
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || 'Помилка збереження адреси');
        }
      }

      toast.success(role === 'receiver' ? 'Отримувача оновлено' : 'Відправника оновлено');
      setOpen(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const defaultCountry: CountryCode = (party.country as CountryCode) || (address?.country as CountryCode) || 'UA';

  return (
    <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-3 my-2 space-y-3">
      <div className="text-xs font-medium text-blue-900">
        Редагувати {role === 'receiver' ? 'Отримувача' : 'Відправника'}: {party.lastName} {party.firstName}
      </div>
      <PhoneInput
        label="Телефон"
        value={phone}
        onChange={setPhone}
        defaultCountry={defaultCountry}
      />
      <AddressEditor
        title="Адреса"
        state={addr}
        onChange={(p) => setAddr({ ...addr, ...p })}
      />
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Збереження…' : 'Зберегти'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
          Скасувати
        </Button>
      </div>
      <div className="text-[11px] text-gray-500">
        {/* Per ТЗ: parcel ID context only — actual updates land on the client + address. */}
        Зміни підуть до картки клієнта (#{parcelId.slice(0, 8)}…)
      </div>
    </div>
  );
}
