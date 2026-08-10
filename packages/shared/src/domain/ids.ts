/**
 * Branded id types.
 *
 * These are strings at runtime and distinct types at compile time, so passing a
 * PlotId where a CropId is expected is a type error rather than a silent bug.
 */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Brand<string, 'UserId'>;
export type SaveId = Brand<string, 'SaveId'>;
export type PlotId = Brand<string, 'PlotId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type CropId = Brand<string, 'CropId'>;
export type AnimalId = Brand<string, 'AnimalId'>;
export type BuildingId = Brand<string, 'BuildingId'>;
export type ItemId = Brand<string, 'ItemId'>;
export type EventId = Brand<string, 'EventId'>;

export const asUserId = (v: string): UserId => v as UserId;
export const asSaveId = (v: string): SaveId => v as SaveId;
export const asPlotId = (v: string): PlotId => v as PlotId;
export const asOrderId = (v: string): OrderId => v as OrderId;
export const asCropId = (v: string): CropId => v as CropId;
export const asItemId = (v: string): ItemId => v as ItemId;

/**
 * Money is stored everywhere as an integer number of cents. Floating point
 * currency is the single most common source of desync between a client's
 * predicted balance and the server's authoritative one, so it is banned.
 */
export type Cents = Brand<number, 'Cents'>;
export const cents = (n: number): Cents => Math.round(n) as Cents;
export const addCents = (a: Cents, b: Cents): Cents => cents(a + b);
export const subCents = (a: Cents, b: Cents): Cents => cents(a - b);
export const mulCents = (a: Cents, factor: number): Cents => cents(a * factor);

/** Formats cents for display. Presentation only - never use for arithmetic. */
export function formatCents(value: Cents, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value / 100);
}
