/**
 * ТЗ docx 18.08.26: СЕРВЕРНА авто-відправка ПІДТВЕРДЖЕННЯ посилки на телефон
 * Отримувача/Відправника різними каналами (SMS / Viber / WhatsApp) + запис факту
 * відправки у лог (`sms_log`, kind='confirmation'), щоб сайт знав, що вже надіслано.
 *
 * Модель провайдерів (адаптери нижче):
 *  • SMS   — TurboSMS/SMSClub REST API (реально шле, коли є TURBOSMS_TOKEN+SENDER).
 *  • Viber — TurboSMS Viber Business (той самий провайдер; коли є TURBOSMS_VIBER_SENDER).
 *  • WhatsApp — потрібен окремий WhatsApp Business API (Meta/Twilio) з шаблонами;
 *               поки що заглушка (лог 'queued', провайдер не підключено).
 *
 * Без ключів усе працює у режимі STUB: тіло формується й ЛОГУЄТЬСЯ (status='queued',
 * provider=null), але зовнішній виклик не відбувається — щойно додати ключі,
 * реальна відправка вмикається без змін у решті коду.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parcelParties } from '@/lib/parcels/party-snapshot';
import { formatDate } from '@/lib/utils/format';

export type MessageChannel = 'sms' | 'viber' | 'whatsapp';

const CHANNEL_LABEL: Record<MessageChannel, string> = {
  sms: 'SMS', viber: 'Viber', whatsapp: 'WhatsApp',
};

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://delivery-delivery5.vercel.app').replace(/\/$/, '');
}

/** ТЗ docx 17.08.26 (Частина 3): текст підтвердження — той самий, що на детальній посилки. */
export function buildConfirmationBody(parcel: {
  internalNumber: string; itn: string; totalPlacesCount: number;
  totalCost: unknown; direction: string; description: string | null;
  trip: { departureDate: Date | string; country: string } | null;
  // для parcelParties:
  status: string; senderSnapshot: unknown; receiverSnapshot: unknown;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
}): string {
  const p = parcelParties(parcel);
  // «135 Amstetten 1/2, 17.08.26» → «135 Amstetten, 17.08.26» (без суфікса місць).
  const label = parcel.internalNumber.replace(/\s\d+(?:\/\d+)?,/, ',');
  const cost = parcel.totalCost != null ? Number(parcel.totalCost) : 0;
  return [
    `Посилка ${label}`,
    parcel.trip ? `Рейс: ${formatDate(parcel.trip.departureDate)}(${parcel.trip.country})` : null,
    `ІТН: ${parcel.itn}`,
    `Отримувач: ${p.receiver.lastName} ${p.receiver.firstName}, ${p.receiver.phone}`,
    `Відправник: ${p.sender.lastName} ${p.sender.firstName}, ${p.sender.phone}`,
    `Місць: ${parcel.totalPlacesCount}`,
    '',
    cost > 0 ? `Вартість: ${cost.toFixed(2)} EUR` : null,
    `Напрямок: ${parcel.direction === 'eu_to_ua' ? 'Європа → Україна' : 'Україна → Європа'}`,
    parcel.description ? `Опис: ${parcel.description}` : null,
    `Відстежити: ${baseUrl()}/tracking?q=${encodeURIComponent(parcel.itn)}`,
  ].filter((l) => l !== null).join('\n');
}

interface SendResult {
  status: 'queued' | 'sent' | 'failed';
  provider: string | null;
  errorMessage?: string;
}

/** Нормалізуємо номер до цифр без '+' (провайдери хочуть 380...). */
function digits(phone: string): string {
  return phone.replace(/\D+/g, '');
}

/**
 * ТЗ docx 23.08.26: чи підключено РЕАЛЬНОГО провайдера для каналу. Якщо ні —
 * інтерфейс не показує «у черзі», а відкриває сам застосунок (deep-link) з
 * готовим текстом, як описано в ТЗ 11.08/17.08 («відкривається відповідна
 * програма з даними особи і формою у тілі повідомлення»).
 */
export function isChannelConfigured(channel: MessageChannel): boolean {
  if (channel === 'whatsapp') return !!process.env.WHATSAPP_TOKEN;
  const token = process.env.TURBOSMS_TOKEN;
  const sender = channel === 'viber' ? process.env.TURBOSMS_VIBER_SENDER : process.env.TURBOSMS_SENDER;
  return !!token && !!sender;
}

export function configuredChannels(): Record<MessageChannel, boolean> {
  return { sms: isChannelConfigured('sms'), viber: isChannelConfigured('viber'), whatsapp: isChannelConfigured('whatsapp') };
}

/**
 * SMS та Viber через TurboSMS (той самий REST API). Коли ключа немає — STUB.
 * Документація: POST https://api.turbosms.ua/message/send.json,
 * Authorization: Basic <API_KEY>, body {recipients:[...], sms|viber:{sender,text}}.
 */
async function sendViaTurboSms(channel: 'sms' | 'viber', phone: string, body: string): Promise<SendResult> {
  const token = process.env.TURBOSMS_TOKEN;
  const smsSender = process.env.TURBOSMS_SENDER;             // імʼя відправника SMS (альфа-імʼя)
  const viberSender = process.env.TURBOSMS_VIBER_SENDER;     // зареєстрований Viber-сендер
  const sender = channel === 'viber' ? viberSender : smsSender;

  if (!token || !sender) {
    logger.info('messaging.stub_send', { channel, phone: digits(phone), bodyLength: body.length });
    return { status: 'queued', provider: null };
  }
  try {
    const payload = channel === 'viber'
      ? { recipients: [digits(phone)], viber: { sender, text: body } }
      : { recipients: [digits(phone)], sms: { sender, text: body } };
    const res = await fetch('https://api.turbosms.ua/message/send.json', {
      method: 'POST',
      headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.response_status !== 'OK') {
      return { status: 'failed', provider: 'turbosms', errorMessage: `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}` };
    }
    return { status: 'sent', provider: 'turbosms' };
  } catch (err) {
    return { status: 'failed', provider: 'turbosms', errorMessage: err instanceof Error ? err.message : 'unknown' };
  }
}

/** WhatsApp — потрібен WhatsApp Business API (Meta/Twilio) + затверджені шаблони. Поки STUB. */
async function sendViaWhatsApp(phone: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    logger.info('messaging.stub_send', { channel: 'whatsapp', phone: digits(phone), bodyLength: body.length });
    return { status: 'queued', provider: null };
  }
  // TODO: реальний виклик Meta Cloud API / Twilio WhatsApp з шаблоном — після
  // отримання бізнес-акаунта, phone_number_id та затвердженого шаблону.
  logger.info('messaging.whatsapp_pending', { phone: digits(phone) });
  return { status: 'queued', provider: null };
}

function dispatch(channel: MessageChannel, phone: string, body: string): Promise<SendResult> {
  if (channel === 'whatsapp') return sendViaWhatsApp(phone, body);
  return sendViaTurboSms(channel, phone, body); // 'sms' | 'viber'
}

export interface SendConfirmationArgs {
  parcelId: string;
  toParty: 'sender' | 'receiver';
  channel: MessageChannel;
  sentById: string;
  /**
   * ТЗ docx 23.08.26: 'manual' — працівник надіслав сам із застосунку (WA/Viber/SMS
   * відкрились deep-link'ом із готовим текстом). Зовнішній виклик не потрібен —
   * лише фіксуємо факт у логу. 'auto' (дефолт) — сервер шле через провайдера.
   */
  mode?: 'auto' | 'manual';
}

/**
 * Оркестратор: резолвить адресата → будує текст → шле обраним каналом → пише у
 * sms_log (kind='confirmation', channel) → повертає результат. Завжди логуємо
 * (навіть при помилці) — щоб на сайті була історія «що і коли надіслано».
 */
export async function sendConfirmation(args: SendConfirmationArgs): Promise<{
  ok: boolean; logId: string; status: SendResult['status']; channelLabel: string; errorMessage?: string;
}> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: args.parcelId },
    select: {
      id: true, internalNumber: true, itn: true, totalPlacesCount: true, totalCost: true,
      direction: true, description: true, status: true, senderSnapshot: true, receiverSnapshot: true,
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
      trip: { select: { departureDate: true, country: true } },
    },
  });
  if (!parcel) throw new Error('PARCEL_NOT_FOUND');

  const parties = parcelParties(parcel);
  const target = args.toParty === 'sender' ? parties.sender : parties.receiver;
  const phone = target.phone;
  if (!phone) throw new Error('NO_PHONE_FOR_PARTY');

  const body = buildConfirmationBody(parcel);

  let result: SendResult;
  if (args.mode === 'manual') {
    // Надіслано працівником вручну через месенджер — фіксуємо як відправлене.
    result = { status: 'sent', provider: 'deeplink' };
  } else {
    try {
      result = await dispatch(args.channel, phone, body);
    } catch (err) {
      result = { status: 'failed', provider: null, errorMessage: err instanceof Error ? err.message : 'send error' };
    }
  }

  const log = await prisma.smsLog.create({
    data: {
      parcelId: parcel.id,
      toParty: args.toParty,
      toPhone: phone,
      body,
      channel: args.channel,
      kind: 'confirmation',
      provider: result.provider,
      status: result.status,
      errorMessage: result.errorMessage ?? null,
      sentById: args.sentById,
    },
  });

  return {
    ok: result.status !== 'failed',
    logId: log.id,
    status: result.status,
    channelLabel: CHANNEL_LABEL[args.channel],
    errorMessage: result.errorMessage,
  };
}
