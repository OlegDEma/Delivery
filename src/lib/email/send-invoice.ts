/**
 * Send a parcel invoice as SMS to the payer's phone.
 *
 * Per ТЗ: «При відмічанні чекбокса на телефонний номер 'Платник за доставку'
 * відправляється повідомлення. Повідомлення включає наперед заданий шаблон з
 * реквізитами банку надавача послуг транспортування та сумою оплати.»
 *
 * Transport: Twilio (https://twilio.com) via REST API — no SDK dependency.
 * Required env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
 * Bank-details template lives in INVOICE_BANK_TEMPLATE (multi-line ok).
 *
 * If credentials are missing, the send is skipped with a warning log so the
 * parcel-creation flow keeps working without SMS configured.
 */

import { logger } from '@/lib/logger';

export interface InvoicePayload {
  /** Phone number of the payer (E.164, e.g. "+380501234567"). */
  to: string;
  parcelInternalNumber: string;
  parcelItn: string;
  payerName: string;
  totalCost: number | null;
  currency: string;
  declaredValue: number | null;
  insuranceCost: number | null;
}

export type InvoiceResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not_configured' | 'http_error'; detail?: string };

const DEFAULT_BANK_TEMPLATE =
  'Реквізити для оплати:\nIBAN: UA000000000000000000000000000\nОдержувач: ТОВ "Delivery"\nПризначення: Транспортні послуги.';

export async function sendInvoiceEmail(payload: InvoicePayload): Promise<InvoiceResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    logger.warn('sms.invoice.not_configured', {
      hasSid: !!sid, hasToken: !!token, hasFrom: !!from, parcel: payload.parcelInternalNumber,
    });
    return { ok: false, reason: 'not_configured' };
  }

  const body = renderInvoiceText(payload);

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ From: from, To: payload.to, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error('sms.invoice.http_error', undefined, {
        status: res.status, detail: detail.slice(0, 500),
        parcel: payload.parcelInternalNumber,
      });
      return { ok: false, reason: 'http_error', detail: detail.slice(0, 500) };
    }
    const data = await res.json() as { sid?: string };
    logger.info('sms.invoice.sent', {
      id: data.sid, to: payload.to, parcel: payload.parcelInternalNumber,
    });
    return { ok: true, id: data.sid ?? '' };
  } catch (err) {
    logger.error('sms.invoice.exception', err, { parcel: payload.parcelInternalNumber });
    return { ok: false, reason: 'http_error', detail: err instanceof Error ? err.message : 'unknown' };
  }
}

function renderInvoiceText(p: InvoicePayload): string {
  const fmt = (n: number | null) => n != null ? n.toFixed(2) : '—';
  const template = process.env.INVOICE_BANK_TEMPLATE || DEFAULT_BANK_TEMPLATE;
  const lines = [
    `Рахунок за посилку ${p.parcelInternalNumber}`,
    p.payerName ? `Платник: ${p.payerName}` : null,
    `Оголошена вартість: ${fmt(p.declaredValue)} ${p.currency}`,
    `Страхування: ${fmt(p.insuranceCost)} ${p.currency}`,
    `До сплати: ${fmt(p.totalCost)} ${p.currency}`,
    '',
    template,
  ].filter(Boolean);
  return lines.join('\n');
}
