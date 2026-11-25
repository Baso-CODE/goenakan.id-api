import { round } from "./analytics.helper";

export type LogisticsCategory = "IMPORT" | "DOMESTIC" | "UNKNOWN";

type DurationRecord = {
  start: Date | null;
  end: Date | null;
  category: LogisticsCategory;
};

const DOMESTIC_COUNTRIES = new Set([
  "indonesia",
  "republik indonesia",
  "republic of indonesia",
  "id",
  "idn",
]);

const UNKNOWN_COUNTRIES = new Set([
  "",
  "-",
  "unknown",
  "unknown country",
  "n/a",
  "null",
  "undefined",
  "other",
  "lainnya",
  "tidak diketahui",
]);

// ==========================================
// RESOLVE COUNTRY CATEGORY
// ==========================================
export function resolveLogisticsCategory(
  country?: string | null,
): LogisticsCategory {
  const normalized = country?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";

  if (UNKNOWN_COUNTRIES.has(normalized)) {
    return "UNKNOWN";
  }

  if (DOMESTIC_COUNTRIES.has(normalized)) {
    return "DOMESTIC";
  }

  return "IMPORT";
}

// ==========================================
// RESOLVE CATEGORY FROM MULTIPLE VENDORS
// ==========================================
export function resolveCombinedCategory(
  countries: Array<string | null | undefined>,
): LogisticsCategory {
  if (countries.length === 0) {
    return "UNKNOWN";
  }

  const categories = new Set(countries.map(resolveLogisticsCategory));

  if (categories.has("UNKNOWN") || categories.size !== 1) {
    return "UNKNOWN";
  }

  return categories.has("IMPORT") ? "IMPORT" : "DOMESTIC";
}

// ==========================================
// CALCULATE AVERAGE DURATION BY CATEGORY
// ==========================================
export function calculateCategoryAverages(records: DurationRecord[]) {
  const groups = {
    IMPORT: {
      totalDays: 0,
      count: 0,
    },
    DOMESTIC: {
      totalDays: 0,
      count: 0,
    },
    UNKNOWN: {
      totalDays: 0,
      count: 0,
    },
  };

  for (const record of records) {
    if (!record.start || !record.end) {
      continue;
    }

    const diffMs = record.end.getTime() - record.start.getTime();

    // Abaikan tanggal yang tidak valid.
    if (!Number.isFinite(diffMs) || diffMs < 0) {
      continue;
    }

    const durationDays = diffMs / (1000 * 60 * 60 * 24);

    const group = groups[record.category];

    group.totalDays += durationDays;
    group.count += 1;
  }

  const average = (group: { totalDays: number; count: number }) =>
    group.count > 0 ? round(group.totalDays / group.count, 1) : null;

  return {
    importDays: average(groups.IMPORT),

    domesticDays: average(groups.DOMESTIC),

    importCount: groups.IMPORT.count,

    domesticCount: groups.DOMESTIC.count,

    unknownCount: groups.UNKNOWN.count,
  };
}
