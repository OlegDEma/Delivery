/**
 * Invoice-SMS pipeline (per ТЗ).
 *
 * Workflow:
 *   1. Operator opens a parcel and ticks «Відправити рахунок Відправнику»
 *      (or Отримувачу) checkbox.
 *   2. We resolve the recipient phone, render the saved invoice template
 *      with parcel details, and hand the SMS body to the provider.
 *   3. The result (queued / sent / failed) is persisted in `sms_log` and
 *      `parcel.invoiceSentToPayerAt` is bumped on success — so the parcel
 *      detail page can show «Рахунок надіслано <дата>» without re-querying
 *      the SMS log on every render.
 *
 * Provider stub: while the carrier hasn't picked an SMS gateway yet
 * (Twilio / TurboSMS / Viber bot) the sender just logs the body to the
 * console and writes status='queued'. Swap `sendViaProvider` for a real
 * call once integration is decided — no other code in the pipeline needs
 * to change.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parcelParties } from '@/lib/parcels/party-snapshot';
import { formatItn } from '@/lib/utils/itn';
import { parcelNumberWithJourney } from '@/lib/parcels/display-number';
import { dispatch, isChannelConfigured, type MessageChannel } from '@/lib/services/messaging';
import { invoiceUahPerEur } from '@/lib/utils/cash-rate';

export interface InvoiceContext {
  /** Recipient party — who's getting the SMS. */
  toParty: 'sender' | 'receiver';
  /** Recipient name (full, used in greeting). */
  name: string;
  /** Recipient phone, E.164-ish. */
  phone: string;
  /** Сума до оплати — у валюті `currency` (EUR або, при оплаті в Україні, грн). */
  amount: number;
  /** ТЗ docx 04.11.26 (п.7): 'UAH' — рахунок у гривнях (оплата в Україні). */
  currency?: 'EUR' | 'UAH';
  /** Parcel ITN. */
  itn: string;
  /** Internal number (e.g. «2026/N00031»). */
  internalNumber: string;
  /** ТЗ docx 03.10.26 (п.2): ТТН Нової пошти — доступна заміна у шаблоні. */
  npTtn?: string | null;
}

export interface BankDetails {
  bankName?: string | null;
  iban?: string | null;
  accountHolder?: string | null;
  swift?: string | null;
  /** Free-form template with `{{placeholder}}` markers. */
  smsTemplate?: string | null;
}

const DEFAULT_TEMPLATE =
  'Шановний(а) {{name}}!\n' +
  'До оплати за доставку {{internalNumber}}: {{amount}} EUR.\n' +
  'Реквізити: {{accountHolder}}, IBAN {{iban}} ({{bankName}}).\n' +
  'Дякуємо!';

/**
 * Substitute `{{placeholder}}` markers with values from the context. Missing
 * values render as an empty string so a partially-configured bank doesn't
 * crash the send — the operator gets visibility via the SMS log instead.
 */
export function renderInvoiceTemplate(
  template: string | null | undefined,
  ctx: InvoiceContext,
  bank: BankDetails
): string {
  // ТЗ docx 04.11.26 (п.7): у шаблоні після {{amount}} стоїть «EUR» — для рахунку в гривнях
  // валюта має бути «грн». Підставляємо {{currency}} на місце написаної вручну валюти.
  const tpl = ((template && template.trim()) || DEFAULT_TEMPLATE)
    .replace(/\{\{amount\}\}(\s*)(?:EUR|€|євро)/gi, '{{amount}}$1{{currency}}');
  const data: Record<string, string> = {
    name: ctx.name,
    amount: ctx.amount.toFixed(2),
    currency: ctx.currency === 'UAH' ? 'грн' : 'EUR',
    // ТЗ docx 07.10.26: ІТН у тексті — у вигляді X-XX-XXXXXX-X.
    itn: formatItn(ctx.itn),
    internalNumber: ctx.internalNumber,
    npTtn: ctx.npTtn ?? '',
    bankName: bank.bankName ?? '',
    iban: bank.iban ?? '',
    accountHolder: bank.accountHolder ?? '',
    swift: bank.swift ?? '',
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
}

interface SendResult {
  status: 'queued' | 'sent' | 'failed';
  provider: string | null;
  errorMessage?: string;
}

/**
 * Provider call. Currently uses Twilio when TWILIO_ACCOUNT_SID +
 * TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER are configured; otherwise falls
 * back to a stub that returns 'queued' so the rest of the pipeline still
 * runs (and the operator gets audit visibility via `sms_log`).
 *
 * Swap the inner `if (sid && ...)` block with TurboSMS / Viber / etc to
 * change provider — the wrapping orchestrator (`sendInvoice`) doesn't need
 * to know.
 */
async function sendViaProvider(phone: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    // Stub: log, mark as queued. Once provider env is set, real send kicks in
    // automatically without touching this file.
    logger.info('sms.invoice.stub_send', { phone, bodyLength: body.length });
    return { status: 'queued', provider: null };
  }

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ From: from, To: phone, Body: body });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return {
        status: 'failed',
        provider: 'twilio',
        errorMessage: `HTTP ${res.status}: ${detail.slice(0, 300)}`,
      };
    }
    return { status: 'sent', provider: 'twilio' };
  } catch (err) {
    return {
      status: 'failed',
      provider: 'twilio',
      errorMessage: err instanceof Error ? err.message : 'unknown',
    };
  }
}

export interface SendInvoiceArgs {
  parcelId: string;
  toParty: 'sender' | 'receiver';
  /** Optional override; defaults to the party's stored phone. */
  overridePhone?: string;
  sentById: string;
  /** ТЗ docx 04.11.26 (п.7): канал — SMS (за замовчуванням), Viber або WhatsApp. */
  channel?: MessageChannel;
  /**
   * 'manual' — Працівник надіслав сам: месенджер/SMS відкрився з готовим текстом
   * (провайдера автоматичної розсилки ще немає); лише фіксуємо факт у журналі.
   */
  mode?: 'auto' | 'manual';
  /** Лише сформувати текст (для вікна «Надіслати рахунок»), нічого не надсилати й не писати. */
  preview?: boolean;
}

/** Чи має канал реального провайдера (сервер шле сам) — для рахунку. */
export function invoiceChannelConfigured(channel: MessageChannel): boolean {
  if (channel === 'sms') {
    return (!!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM_NUMBER)
      || isChannelConfigured('sms');
  }
  return isChannelConfigured(channel);
}

/**
 * High-level orchestrator: resolves recipient, renders body, calls provider,
 * persists `sms_log` + `parcel.invoiceSentToPayerAt`.
 */
export async function sendInvoice(args: SendInvoiceArgs): Promise<{
  ok: boolean;
  smsLogId: string;
  body: string;
  phone: string;
  status: SendResult['status'];
  errorMessage?: string;
}> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: args.parcelId },
    select: {
      id: true, itn: true, npTtn: true, internalNumber: true, journeyNumber: true, totalCost: true,
      // ТЗ docx 04.11.26 (п.7): оплата в Україні → рахунок у гривнях.
      paymentInUkraine: true,
      // ТЗ docx 26.07.26 (п.1): для accepted+ ПІБ/тел беремо зі знімка (parcelParties).
      status: true, senderSnapshot: true, receiverSnapshot: true,
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
    },
  });
  if (!parcel) {
    throw new Error('PARCEL_NOT_FOUND');
  }

  const parties = parcelParties(parcel);
  const target = args.toParty === 'sender' ? parties.sender : parties.receiver;
  const phone = args.overridePhone?.trim() || target.phone;
  if (!phone) throw new Error('NO_PHONE_FOR_PARTY');

  const totalCost = parcel.totalCost ? Number(parcel.totalCost) : 0;
  if (totalCost <= 0) throw new Error('TOTAL_COST_NOT_SET');

  const settings = await prisma.invoiceSettings.findFirst({ where: { isSingleton: true } });
  // ТЗ docx 04.11.26 (п.7): «При виборі оплати в Україні рахунок повинен виставлятись лише в
  // гривнях» — сума в євро × курс продажу євро в обмінниках (запасний — курс НБУ).
  const inUah = !!parcel.paymentInUkraine;
  const uahRate = inUah ? (await invoiceUahPerEur()).rate : 1;
  const body = renderInvoiceTemplate(
    settings?.smsTemplate ?? null,
    {
      toParty: args.toParty,
      name: `${target.firstName} ${target.lastName}`.trim(),
      phone,
      amount: inUah ? Math.round(totalCost * uahRate * 100) / 100 : totalCost,
      currency: inUah ? 'UAH' : 'EUR',
      itn: parcel.itn,
      // ТЗ docx 12.10.26: у повідомленні — без старого порядкового номера.
      internalNumber: parcelNumberWithJourney(parcel.internalNumber, parcel.journeyNumber),
      npTtn: parcel.npTtn,
    },
    {
      bankName: settings?.bankName,
      iban: settings?.iban,
      accountHolder: settings?.accountHolder,
      swift: settings?.swift,
    }
  );

  if (args.preview) {
    return { ok: true, smsLogId: '', body, phone, status: 'queued' };
  }

  const channel: MessageChannel = args.channel ?? 'sms';
  let result: SendResult;
  if (args.mode === 'manual') {
    // ТЗ docx 04.11.26 (п.7): Працівник надіслав сам (відкрився месенджер/SMS з текстом).
    result = { status: 'sent', provider: 'deeplink' };
  } else {
    try {
      result = channel === 'sms' ? await sendViaProvider(phone, body) : await dispatch(channel, phone, body);
    } catch (err) {
      result = { status: 'failed', provider: null, errorMessage: err instanceof Error ? err.message : 'send error' };
    }
  }

  // Always log — even on failure — so audit trail is preserved.
  const log = await prisma.smsLog.create({
    data: {
      parcelId: parcel.id,
      toParty: args.toParty,
      toPhone: phone,
      body,
      channel,
      provider: result.provider,
      status: result.status,
      errorMessage: result.errorMessage ?? null,
      sentById: args.sentById,
    },
  });

  // Bump invoiceSentToPayerAt on success-ish (queued/sent both count) so the
  // parcel detail page can show «надіслано».
  if (result.status !== 'failed') {
    await prisma.parcel.update({
      where: { id: parcel.id },
      data: { invoiceSentToPayerAt: new Date() },
    });
  }

  return {
    ok: result.status !== 'failed',
    smsLogId: log.id,
    body,
    phone,
    status: result.status,
    errorMessage: result.errorMessage,
  };
}
