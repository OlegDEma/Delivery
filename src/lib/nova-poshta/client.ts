const NP_API_URL = 'https://api.novaposhta.ua/v2.0/json/';

interface NPRequest {
  apiKey: string;
  modelName: string;
  calledMethod: string;
  methodProperties: Record<string, unknown>;
}

interface NPResponse<T = unknown> {
  success: boolean;
  data: T[];
  errors: string[];
  warnings: string[];
  info: { totalCount: number };
}

function getApiKey(): string {
  const key = process.env.NP_API_KEY;
  if (!key) throw new Error('NP_API_KEY is not set');
  return key;
}

export async function npCall<T = unknown>(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, unknown> = {},
  /** Трекінг ТТН НП віддає і без ключа API — тоді ключ необовʼязковий. */
  options: { keyOptional?: boolean } = {},
): Promise<NPResponse<T>> {
  const body: NPRequest = {
    apiKey: options.keyOptional ? (process.env.NP_API_KEY || '') : getApiKey(),
    modelName,
    calledMethod,
    methodProperties,
  };

  const res = await fetch(NP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Nova Poshta API error: ${res.status}`);
  }

  return res.json();
}

// ============================================================
// Address methods
// ============================================================

export interface NPCity {
  Ref: string;
  Description: string;
  DescriptionRu: string;
  Area: string;
  AreaDescription: string;
  SettlementType: string;
  SettlementTypeDescription: string;
}

export interface NPWarehouse {
  Ref: string;
  SiteKey: string;
  Description: string;
  DescriptionRu: string;
  Number: string;
  CityRef: string;
  CityDescription: string;
  TypeOfWarehouse: string;
  ShortAddress: string;
  Phone: string;
  PlaceMaxWeightAllowed: string;
  CategoryOfWarehouse: string;
}

export interface NPStreet {
  Ref: string;
  Description: string;
  StreetsTypeRef: string;
  StreetsType: string;
}

/** Search cities by name */
export async function searchCities(query: string, limit = 20) {
  return npCall<NPCity>('AddressGeneral', 'searchSettlements', {
    CityName: query,
    Limit: String(limit),
    Page: '1',
  });
}

/** Get cities (full list or filtered) */
export async function getCities(findByString?: string, ref?: string) {
  return npCall<NPCity>('Address', 'getCities', {
    ...(findByString && { FindByString: findByString }),
    ...(ref && { Ref: ref }),
    Limit: '20',
    Page: '1',
  });
}

/** Get warehouses for a city */
export async function getWarehouses(cityRef: string, findByString?: string, typeOfWarehouseRef?: string) {
  return npCall<NPWarehouse>('Address', 'getWarehouses', {
    CityRef: cityRef,
    ...(findByString && { FindByString: findByString }),
    ...(typeOfWarehouseRef && { TypeOfWarehouseRef: typeOfWarehouseRef }),
    Limit: '50',
    Page: '1',
  });
}

/** Get streets for a city */
export async function getStreets(cityRef: string, findByString?: string) {
  return npCall<NPStreet>('Address', 'getStreet', {
    CityRef: cityRef,
    ...(findByString && { FindByString: findByString }),
    Limit: '20',
    Page: '1',
  });
}

// ============================================================
// Document (TTN) methods
// ============================================================

export interface NPCounterparty {
  Ref: string;
  Description: string;
  FirstName: string;
  LastName: string;
  MiddleName: string;
  Phone: string;
}

export interface NPContactPerson {
  Ref: string;
  Description: string;
  FirstName: string;
  LastName: string;
  MiddleName: string;
  Phones: string;
}

export interface NPTTNResult {
  Ref: string;
  CostOnSite: number;
  EstimatedDeliveryDate: string;
  IntDocNumber: string;
  TypeDocument: string;
}

/** Get sender counterparty (your company) */
export async function getSenderCounterparty() {
  return npCall<NPCounterparty>('Counterparty', 'getCounterparties', {
    CounterpartyProperty: 'Sender',
    Page: '1',
  });
}

/** Get contact persons for counterparty */
export async function getContactPersons(counterpartyRef: string) {
  return npCall<NPContactPerson>('Counterparty', 'getCounterpartyContactPersons', {
    Ref: counterpartyRef,
    Page: '1',
  });
}

/** Create internet document (TTN) */
export async function createTTN(params: {
  senderRef: string;
  senderAddressRef: string;
  contactSenderRef: string;
  senderPhone: string;
  recipientCityRef: string;
  recipientAddressRef: string;
  recipientName: string;
  recipientPhone: string;
  weight: number;
  volumeWeight?: number;
  seatsAmount: number;
  description: string;
  cost: number;
  payerType: 'Sender' | 'Recipient';
  paymentMethod: 'Cash' | 'NonCash';
  serviceType: 'WarehouseWarehouse' | 'WarehouseDoors' | 'DoorsWarehouse' | 'DoorsDoors';
  cargoType?: string;
  optionsSeat?: { volumetricWidth: number; volumetricLength: number; volumetricHeight: number; weight: number }[];
}) {
  return npCall<NPTTNResult>('InternetDocument', 'save', {
    NewAddress: '1',
    PayerType: params.payerType,
    PaymentMethod: params.paymentMethod,
    CargoType: params.cargoType || 'Cargo',
    VolumeGeneral: params.volumeWeight ? String(params.volumeWeight) : undefined,
    Weight: String(params.weight),
    ServiceType: params.serviceType,
    SeatsAmount: String(params.seatsAmount),
    Description: params.description,
    Cost: String(params.cost),
    CitySender: '', // Will be from sender config
    Sender: params.senderRef,
    SenderAddress: params.senderAddressRef,
    ContactSender: params.contactSenderRef,
    SendersPhone: params.senderPhone,
    CityRecipient: params.recipientCityRef,
    RecipientAddress: params.recipientAddressRef,
    Recipient: '', // Will create on the fly
    ContactRecipient: '',
    RecipientsPhone: params.recipientPhone,
    DateTime: new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    ...(params.optionsSeat && { OptionsSeat: params.optionsSeat }),
  });
}

// ============================================================
// Tracking methods
// ============================================================

export interface NPTrackingInfo {
  Number: string;
  StatusCode: string;
  Status: string;
  WarehouseRecipient: string;
  CityRecipient: string;
  RecipientDateTime: string;
  ScheduledDeliveryDate: string;
  ActualDeliveryDate: string;
}

/** Track document by TTN number */
export async function trackDocument(documentNumber: string) {
  return npCall<NPTrackingInfo>('TrackingDocument', 'getStatusDocuments', {
    Documents: [{ DocumentNumber: documentNumber }],
  });
}

/** Track multiple documents */
export async function trackDocuments(documentNumbers: string[]) {
  return npCall<NPTrackingInfo>('TrackingDocument', 'getStatusDocuments', {
    Documents: documentNumbers.map(n => ({ DocumentNumber: n })),
  });
}

// ============================================================
// ТЗ docx 04.11.26 (п.6): дані Відправника з ТТН
// ============================================================

/**
 * Телефон Отримувача, на який клієнти відправляють посилки до Європи (ФОП у Львові —
 * той самий номер, що в інструкції «Відправка поштою»). Нова пошта віддає ПІБ і телефон
 * сторін у getStatusDocuments лише тоді, коли в запиті вказано телефон відправника або
 * отримувача цієї ТТН. Можна перевизначити змінною середовища NP_RECIPIENT_PHONE.
 */
const NP_RECIPIENT_PHONE = (process.env.NP_RECIPIENT_PHONE || '380673320502').replace(/\D/g, '');

/** Поля getStatusDocuments, які потрібні для Відправника (решту відповіді ігноруємо). */
interface NPStatusFull {
  Number?: string;
  StatusCode?: string;
  Status?: string;
  PhoneSender?: string;
  SenderFullNameEW?: string;
  SenderFullName?: string;
  CounterpartySenderDescription?: string;
  CitySender?: string;
  WarehouseSender?: string;
  SenderAddress?: string;
}

export interface NpTtnSender {
  ttn: string;
  phone: string | null;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  city: string | null;
  warehouseNumber: string | null;
  /** Текст відділення як у НП («Відділення №5 (до 30 кг): вул. …») — для показу. */
  warehouseText: string | null;
}

/** «Відділення №5 (до 30 кг): …», «Пункт приймання-видачі №1234», «Поштомат №5678» → номер. */
export function npWarehouseNumberFromText(text: string | null | undefined): string | null {
  const m = /№\s*(\d+)/.exec(text ?? '');
  return m ? m[1] : null;
}

/** «Шевченко Тарас Григорович» → прізвище / ім'я / по батькові (порядок як у НП). */
export function splitNpFullName(full: string | null | undefined) {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    lastName: parts[0] ?? null,
    firstName: parts[1] ?? null,
    middleName: parts.length > 2 ? parts.slice(2).join(' ') : null,
  };
}

/**
 * ТЗ docx 04.11.26 (п.6): «Ми скануємо номер ТТН і отримуємо по API з Нової пошти всі
 * реквізити даної посилки. З цих реквізитів вибираються дані Відправника: номер
 * телефону, прізвище, ім'я, місто відправлення, номер пошти».
 *
 * Повертає null, якщо ТТН у НП не знайдено. Кидає помилку, якщо НП недоступна.
 */
export async function getNpTtnSender(ttn: string): Promise<NpTtnSender | null> {
  const number = ttn.replace(/\D/g, '');
  // Трекінг працює і без ключа API (перевірено 08.11.26); ПІБ і телефон Відправника НП
  // віддає саме тому, що в запиті — телефон отримувача цієї ТТН.
  const res = await npCall<NPStatusFull>('TrackingDocument', 'getStatusDocuments', {
    Documents: [{ DocumentNumber: number, Phone: NP_RECIPIENT_PHONE }],
  }, { keyOptional: true });
  const d = res.data?.[0];
  // StatusCode 3 — «Номер не знайдено».
  if (!res.success || !d || d.StatusCode === '3') return null;
  const name = splitNpFullName(d.SenderFullNameEW || d.SenderFullName || d.CounterpartySenderDescription);
  const phoneDigits = (d.PhoneSender ?? '').replace(/\D/g, '');
  const warehouseText = d.WarehouseSender || d.SenderAddress || null;
  return {
    ttn: number,
    phone: phoneDigits ? `+${phoneDigits.startsWith('380') ? phoneDigits : `38${phoneDigits}`}` : null,
    ...name,
    city: d.CitySender?.trim() || null,
    // Окремого номера відділення відправника НП не віддає — беремо з «Відділення №5 …».
    warehouseNumber: npWarehouseNumberFromText(warehouseText),
    warehouseText,
  };
}
