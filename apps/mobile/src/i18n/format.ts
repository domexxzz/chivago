/**
 * Locale-aware presentation formatting.
 *
 * Business values stay numbers and ISO timestamps until they reach the UI.
 * Every formatter reads the same locale as `t()`, so a language switch updates
 * dates, figures and money together instead of leaving English fragments on a
 * Thai or Chinese screen.
 */
import { localeTag } from './locale.ts';

const tag = (): string => localeTag();
const LATIN_DIGITS = 'latn';

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(tag(), { numberingSystem: LATIN_DIGITS, ...options }).format(value);
}

export const formatInteger = (value: number): string =>
  formatNumber(value, { maximumFractionDigits: 0 });

export const formatDecimal = (value: number, maximumFractionDigits = 2): string =>
  formatNumber(value, { maximumFractionDigits });

export const formatPercentage = (value: number, maximumFractionDigits = 0): string =>
  formatNumber(value, { style: 'percent', maximumFractionDigits });

export function formatCurrency(value: number, currency = 'THB'): string {
  return formatNumber(value, { style: 'currency', currency, currencyDisplay: 'symbol' });
}

type DateInput = Date | string | number;
const validDate = (input: DateInput): Date | null => {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
};

const DATE_PARTS: (keyof Intl.DateTimeFormatOptions)[] = [
  'weekday', 'era', 'year', 'month', 'day', 'dayPeriod',
  'hour', 'minute', 'second', 'fractionalSecondDigits', 'timeZoneName',
];
const hasExplicitParts = (options: Intl.DateTimeFormatOptions): boolean =>
  DATE_PARTS.some((key) => options[key] !== undefined)
  || options.dateStyle !== undefined
  || options.timeStyle !== undefined;

export function formatDate(input: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  const date = validDate(input);
  const defaults: Intl.DateTimeFormatOptions = hasExplicitParts(options) ? {} : { dateStyle: 'medium' };
  return date ? new Intl.DateTimeFormat(tag(), { ...defaults, ...options }).format(date) : '—';
}

export function formatTime(input: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  const date = validDate(input);
  const defaults: Intl.DateTimeFormatOptions = hasExplicitParts(options) ? {} : { hour: '2-digit', minute: '2-digit' };
  return date ? new Intl.DateTimeFormat(tag(), { ...defaults, ...options }).format(date) : '—';
}

export function formatDateTime(input: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  const date = validDate(input);
  const defaults: Intl.DateTimeFormatOptions = hasExplicitParts(options)
    ? {}
    : { dateStyle: 'medium', timeStyle: 'short' };
  return date ? new Intl.DateTimeFormat(tag(), { ...defaults, ...options }).format(date) : '—';
}

export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat(tag(), { numeric: 'auto' }).format(value, unit);
}
