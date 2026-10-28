import type { DriverStats } from '../../src/model.ts';
import type { Persistence } from '../db/persistence.ts';

// Each aggregate belongs to the current async reader/transaction. Never cache an uncommitted promise globally.
export async function driverStatistics(reader: Pick<Persistence, 'one' | 'memo'>, id: number, finishedSql: string): Promise<DriverStats> {
  return reader.memo(`driver-stats:${id}:${finishedSql}`, async () => {
    const row = (await reader.one(`SELECT AVG(rating) rating, AVG(price_rating) price_rating,
      COUNT(*) FILTER (WHERE status IN (${finishedSql})) trips FROM orders WHERE driver_id = ?`, id))!;
    const tenth = (value: unknown) => value == null ? null : Math.round(Number(value) * 10) / 10;
    return { rating: tenth(row.rating), priceRating: tenth(row.price_rating), trips: Number(row.trips) };
  });
}

export async function customerStatistics(reader: Pick<Persistence, 'one' | 'memo'>, id: number, finishedSql: string) {
  return reader.memo(`customer-stats:${id}:${finishedSql}`, async () => {
    const row = (await reader.one(`SELECT AVG(customer_rating) rating, COUNT(customer_rating) rated,
      COUNT(*) FILTER (WHERE status IN (${finishedSql})) trips FROM orders WHERE customer_id = ?`, id))!;
    return { rating: Number(row.rated) >= 3 ? Math.round(Number(row.rating) * 10) / 10 : null, trips: Number(row.trips) };
  });
}
