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

export interface InvoiceContext {
  /** Recipient party — who's getting the SMS. */
  toParty: 'sender' | 'receiver';
  /** Recipient name (full, used in greeting). */
  name: string;
  /** Recipient phone, E.164-ish. */
  phone: string;
  /** Total cost in EUR. */
  amount: number;
  /** Parcel ITN. */
  itn: string;
  /** Internal number (e.g. «2026/N00031»). */
  internalNumber: string;
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
  const tpl = (template && template.trim()) || DEFAULT_TEMPLATE;
  const data: Record<string, string> = {
    name: ctx.name,
    amount: ctx.amount.toFixed(2),
    itn: ctx.itn,
    internalNumber: ctx.internalNumber,
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
 * Stubbed provider call. Swap with a real Twilio / TurboSMS implementation
 * later. The stub returns 'queued' so audit logs read consistently once a
 * provider is plugged in.
 */
async function sendViaProvider(_phone: string, _body: string): Promise<SendResult> {
  // Intentionally minimal — the body is already in `sms_log` for audit and
  // we don't want PII in stdout outside dev. `logger.info` keeps the trail
  // structured.
  logger.info('sms.invoice.stub_send', { phone: _phone, bodyLength: _body.length });
  return { status: 'queued', provider: null };
}

export interface SendInvoiceArgs {
  parcelId: string;
  toParty: 'sender' | 'receiver';
  /** Optional override; defaults to the party's stored phone. */
  overridePhone?: string;
  sentById: string;
}

/**
 * High-level orchestrator: resolves recipient, renders body, calls provider,
 * persists `sms_log` + `parcel.invoiceSentToPayerAt`.
 */
export async function sendInvoice(args: SendInvoiceArgs): Promise<{
  ok: boolean;
  smsLogId: string;
  body: string;
  status: SendResult['status'];
  errorMessage?: string;
}> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: args.parcelId },
    select: {
      id: true, itn: true, internalNumber: true, totalCost: true,
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
    },
  });
  if (!parcel) {
    throw new Error('PARCEL_NOT_FOUND');
  }

  const target = args.toParty === 'sender' ? parcel.sender : parcel.receiver;
  const phone = args.overridePhone?.trim() || target.phone;
  if (!phone) throw new Error('NO_PHONE_FOR_PARTY');

  const totalCost = parcel.totalCost ? Number(parcel.totalCost) : 0;
  if (totalCost <= 0) throw new Error('TOTAL_COST_NOT_SET');

  const settings = await prisma.invoiceSettings.findFirst({ where: { isSingleton: true } });
  const body = renderInvoiceTemplate(
    settings?.smsTemplate ?? null,
    {
      toParty: args.toParty,
      name: `${target.firstName} ${target.lastName}`.trim(),
      phone,
      amount: totalCost,
      itn: parcel.itn,
      internalNumber: parcel.internalNumber,
    },
    {
      bankName: settings?.bankName,
      iban: settings?.iban,
      accountHolder: settings?.accountHolder,
      swift: settings?.swift,
    }
  );

  let result: SendResult;
  try {
    result = await sendViaProvider(phone, body);
  } catch (err) {
    result = { status: 'failed', provider: null, errorMessage: err instanceof Error ? err.message : 'send error' };
  }

  // Always log — even on failure — so audit trail is preserved.
  const log = await prisma.smsLog.create({
    data: {
      parcelId: parcel.id,
      toParty: args.toParty,
      toPhone: phone,
      body,
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
    status: result.status,
    errorMessage: result.errorMessage,
  };
}
