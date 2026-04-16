/**
 * Minimal structured logger.
 *
 * Why not pino/winston: keep deps light on Vercel edge. All we need is
 * consistent log format that could later be shipped to Sentry/Logtail
 * by just swapping the transport.
 *
 * Usage:
 *   logger.info('parcel.created', { parcelId, userId });
 *   logger.error('pricing.calc_failed', err, { country, direction });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function emit(level: LogLevel, event: string, context: LogContext = {}, err?: unknown) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  };
  if (err instanceof Error) {
    entry.err = { name: err.name, message: err.message, stack: err.stack };
  } else if (err !== undefined) {
    entry.err = err;
  }

  // eslint-disable-next-line no-console
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(JSON.stringify(entry));
}

export const logger = {
  debug(event: string, context?: LogContext) {
    if (process.env.NODE_ENV === 'production') return;
    emit('debug', event, context);
  },
  info(event: string, context?: LogContext) {
    emit('info', event, context);
  },
  warn(event: string, context?: LogContext) {
    emit('warn', event, context);
  },
  error(event: string, err?: unknown, context?: LogContext) {
    emit('error', event, context, err);
  },
  /** Audit-level log — important user/system actions, always recorded */
  audit(event: string, context: LogContext) {
    emit('info', `audit.${event}`, context);
  },
};
