export const PARCEL_STATUSES = {
  DRAFT: 'draft',
  ACCEPTED_FOR_TRANSPORT_TO_UA: 'accepted_for_transport_to_ua',
  IN_TRANSIT_TO_UA: 'in_transit_to_ua',
  AT_LVIV_WAREHOUSE: 'at_lviv_warehouse',
  AT_NOVA_POSHTA: 'at_nova_poshta',
  DELIVERED_UA: 'delivered_ua',
  ACCEPTED_FOR_TRANSPORT_TO_EU: 'accepted_for_transport_to_eu',
  IN_TRANSIT_TO_EU: 'in_transit_to_eu',
  AT_EU_WAREHOUSE: 'at_eu_warehouse',
  DELIVERED_EU: 'delivered_eu',
  NOT_RECEIVED: 'not_received',
  REFUSED: 'refused',
  RETURNED: 'returned',
} as const;

export type ParcelStatusType = (typeof PARCEL_STATUSES)[keyof typeof PARCEL_STATUSES];

export const STATUS_LABELS: Record<ParcelStatusType, string> = {
  draft: 'Чернетка',
  accepted_for_transport_to_ua: 'Прийнято до перевезення в Україну',
  in_transit_to_ua: 'В дорозі до України',
  at_lviv_warehouse: 'На складі у Львові',
  at_nova_poshta: 'На Новій пошті',
  delivered_ua: 'Доставлено (Україна)',
  accepted_for_transport_to_eu: 'Прийнято до перевезення в Європу',
  in_transit_to_eu: 'В дорозі до Європи',
  at_eu_warehouse: 'На складі в Європі',
  delivered_eu: 'Доставлено (Європа)',
  not_received: 'Не отримано',
  refused: 'Відмова від отримання',
  returned: 'Повернено',
};

export const STATUS_COLORS: Record<ParcelStatusType, string> = {
  draft: 'bg-gray-100 text-gray-800',
  accepted_for_transport_to_ua: 'bg-blue-100 text-blue-800',
  in_transit_to_ua: 'bg-indigo-100 text-indigo-800',
  at_lviv_warehouse: 'bg-purple-100 text-purple-800',
  at_nova_poshta: 'bg-orange-100 text-orange-800',
  delivered_ua: 'bg-green-100 text-green-800',
  accepted_for_transport_to_eu: 'bg-blue-100 text-blue-800',
  in_transit_to_eu: 'bg-indigo-100 text-indigo-800',
  at_eu_warehouse: 'bg-purple-100 text-purple-800',
  delivered_eu: 'bg-green-100 text-green-800',
  not_received: 'bg-red-100 text-red-800',
  refused: 'bg-red-100 text-red-800',
  returned: 'bg-yellow-100 text-yellow-800',
};

// Valid status transitions
export const STATUS_FLOW_EU_TO_UA: ParcelStatusType[] = [
  'draft',
  'accepted_for_transport_to_ua',
  'in_transit_to_ua',
  'at_lviv_warehouse',
  'at_nova_poshta',
  'delivered_ua',
];

export const STATUS_FLOW_UA_TO_EU: ParcelStatusType[] = [
  'draft',
  'accepted_for_transport_to_eu',
  'in_transit_to_eu',
  'at_eu_warehouse',
  'delivered_eu',
];
