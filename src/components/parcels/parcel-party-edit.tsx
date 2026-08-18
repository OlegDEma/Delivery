'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClientCreateForm } from '@/components/clients/client-create-form';

interface PartyAddress {
  id?: string | null;
  country?: string | null;
  city?: string | null;
  street?: string | null;
  building?: string | null;
  apartment?: string | null;
  postalCode?: string | null;
  landmark?: string | null;
  npWarehouseNum?: string | null;
  npPoshtamatNum?: string | null;
  pickupPointText?: string | null;
  deliveryMethod?: string | null;
}

interface PartyData {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  country?: string | null;
}

export interface ParcelPartyEditProps {
  parcelId: string;
  /** 'sender' | 'receiver' — яку сторону посилки оновлюємо. */
  role: 'sender' | 'receiver';
  party: PartyData;
  address: PartyAddress | null;
  /** Напрямок посилки — для дефолтів країни/телефону у формі. */
  direction?: 'eu_to_ua' | 'ua_to_eu';
  /** Викликається після успішного збереження, щоб батько перечитав дані. */
  onSaved: () => void;
}

/**
 * ТЗ docx 17.08.26 (Частина друга): форма редагування Отримувача/Відправника в
 * посилці МАЄ БУТИ АБСОЛЮТНО ІДЕНТИЧНОЮ формі створення посилки — з можливістю
 * міняти КРАЇНУ, місто, адресу, телефон, ПІБ, та з підказками за прізвищем.
 * Тому перевикористовуємо ту саму <ClientCreateForm> у режимі edit (initialData),
 * а стару кастомну форму (лише телефон+адреса, без країни) — прибрано.
 *
 * Після збереження форма оновлює клієнта+адресу (через /api/clients) і повертає
 * свіжого клієнта; тут ми перелінковуємо посилку на цього клієнта і його збережену
 * адресу (addresses[0]) — це тригерить перерахунок.
 */
export function ParcelPartyEdit({ parcelId, role, party, address, direction, onSaved }: ParcelPartyEditProps) {
  const [open, setOpen] = useState(false);

  // initialData для ClientCreateForm — клієнт + поточна адреса саме цієї посилки.
  const initialData = {
    id: party.id,
    phone: party.phone,
    firstName: party.firstName,
    lastName: party.lastName,
    middleName: party.middleName ?? null,
    country: (party.country ?? address?.country) ?? null,
    addresses: address
      ? [{
          id: address.id ?? '',
          country: (address.country ?? party.country) ?? 'UA',
          city: address.city ?? '',
          street: address.street ?? null,
          building: address.building ?? null,
          apartment: address.apartment ?? null,
          postalCode: address.postalCode ?? null,
          landmark: address.landmark ?? null,
          npWarehouseNum: address.npWarehouseNum ?? null,
          npPoshtamatNum: address.npPoshtamatNum ?? null,
          deliveryMethod: address.deliveryMethod ?? 'address',
          usageCount: 0,
          pickupPointText: address.pickupPointText ?? null,
        }]
      : [],
  };

  async function handleSuccess(client: { id: string; addresses: { id: string }[] }) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {};
      // Якщо номер «переїхав» на власника (resolve-to-owner) — id клієнта зміниться.
      if (client.id && client.id !== party.id) {
        body[role === 'sender' ? 'senderId' : 'receiverId'] = client.id;
      }
      // Збережена адреса стоїть першою (ClientCreateForm гарантує addresses[0]).
      const savedAddrId = client.addresses?.[0]?.id;
      if (savedAddrId) {
        body[role === 'sender' ? 'senderAddressId' : 'receiverAddressId'] = savedAddrId;
      }
      if (Object.keys(body).length > 0) {
        const r = await fetch(`/api/parcels/${parcelId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || 'Помилка прив\'язки до посилки');
        }
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-blue-600 hover:text-blue-800 ml-2 inline-flex items-center"
        title={role === 'receiver' ? 'Редагувати дані Отримувача' : 'Редагувати дані Відправника'}
      >
        <Pencil className="w-3 h-3" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Редагувати {role === 'receiver' ? 'Отримувача' : 'Відправника'}
            </DialogTitle>
          </DialogHeader>
          <ClientCreateForm
            role={role}
            direction={direction}
            initialData={initialData}
            onSuccess={handleSuccess}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
