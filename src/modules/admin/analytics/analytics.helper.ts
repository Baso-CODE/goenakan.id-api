// =========================================================================
// SHARED TYPES & HELPERS UNTUK ANALYTICS SERVICES
// =========================================================================

export interface AnalyticsFilterQuery {
  range: string;
  startDate?: string;
  endDate?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// Timezone aplikasi (WIB)
export const APP_TIMEZONE = "Asia/Jakarta";

// =========================================================================
// DATE HELPERS
// =========================================================================

/**
 * Konversi parameter range dari frontend menjadi Date range aktual.
 * Catatan: server diasumsikan jalan di timezone Asia/Jakarta (set lewat
 * env TZ=Asia/Jakarta) atau hasil ini di-normalize di sisi DB.
 */
export function calculateDateRange(query: AnalyticsFilterQuery): DateRange {
  const end = new Date();
  let start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (query.range) {
    case "today":
      break;
    case "7days":
      start.setDate(end.getDate() - 7);
      break;
    case "14days":
      start.setDate(end.getDate() - 14);
      break;
    case "30days":
      start.setDate(end.getDate() - 30);
      break;
    case "90days":
      start.setDate(end.getDate() - 90);
      break;
    case "1year":
      start.setFullYear(end.getFullYear() - 1);
      break;
    case "custom":
      if (query.startDate && query.endDate) {
        start = new Date(query.startDate);
        start.setHours(0, 0, 0, 0);

        const customEnd = new Date(query.endDate);
        customEnd.setHours(23, 59, 59, 999);
        return { start, end: customEnd };
      }
      break;
  }

  return { start, end };
}

/**
 * Hitung selisih hari antara start dan end.
 */
export function getRangeDays(range: DateRange): number {
  const diffMs = range.end.getTime() - range.start.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Buat date key untuk grouping di chart.
 * - Range <= 31 hari: per hari (format: "15 Mar 2026")
 * - Range <= 365 hari: per bulan (format: "Mar 2026")
 * - Range > 365 hari: per bulan dengan tahun (format: "Mar 2026")
 *
 * Selalu sertakan tahun untuk menghindari collision antar tahun.
 */
export function getDateKey(date: Date, rangeDays: number): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: APP_TIMEZONE,
    year: "numeric",
  };

  if (rangeDays <= 31) {
    options.day = "2-digit";
    options.month = "short";
  } else {
    options.month = "short";
  }

  return date.toLocaleDateString("en-US", options);
}

/**
 * Buat sort key (ISO-like) untuk mengurutkan date key chronologically.
 */
export function getDateSortKey(date: Date, rangeDays: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (rangeDays <= 31) {
    return `${year}-${month}-${day}`;
  }
  return `${year}-${month}`;
}

// =========================================================================
// AGGREGATION HELPERS
// =========================================================================

/**
 * Konversi Map<string, number> ke array {name, value}.
 */
export function mapToNameValueArray(
  map: Map<string, number>,
): Array<{ name: string; value: number }> {
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

/**
 * Increment value pada Map. Jika key belum ada, set ke value.
 */
export function incrementMap(
  map: Map<string, number>,
  key: string,
  value: number,
): void {
  map.set(key, (map.get(key) || 0) + value);
}

/**
 * Round angka ke n desimal.
 */
export function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
