import { Prisma } from "@prisma/client";
import { APP_TIMEZONE } from "./analytics.helper";

type ClientLocation = {
  country: string | null;
  province: string | null;
  city: string | null;
};

type AnalyticsOrder = {
  id: string;
  clientId: string;
  dateOrder: Date;
  totalAmount: Prisma.Decimal;
  currencyCode: string;

  purchaseChannel: {
    id: string;
    name: string;
  } | null;

  client: {
    type: string;
    b2b: ClientLocation | null;
    b2c: ClientLocation | null;
  } | null;
};

export type CustomerRegionRow = {
  id: string;
  country: string;
  region: string;
  city: string;
  totalCustomer: number;
  totalSales: number | null;
  currencyCode: string | null;
  salesByCurrency: Record<string, number>;
  lastOrder: string;
};

export type ChannelOrderChartData = {
  channels: {
    key: string;
    name: string;
  }[];

  months: {
    month: string;
    label: string;
    totalOrders: number;
    counts: Record<string, number>;
  }[];
};

type RegionAccumulator = {
  id: string;
  country: string;
  region: string;
  city: string;
  customers: Set<string>;
  salesByCurrency: Map<string, Prisma.Decimal>;
  lastOrder: Date;
};

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
});

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

function getMonthKey(date: Date): string {
  const parts = monthFormatter.formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;

  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

function normalizeLocation(
  value: string | null | undefined,
  fallback: string,
): string {
  return value?.trim().replace(/\s+/g, " ") || fallback;
}

// ==========================================
// GENERATE MONTH BUCKETS
// ==========================================
// Bulan tanpa order tetap ditampilkan.
function createMonthBuckets(range: { start: Date; end: Date }) {
  const buckets = new Map<
    string,
    {
      month: string;
      label: string;
      totalOrders: number;
      counts: Map<string, number>;
    }
  >();

  const [startYear, startMonth] = getMonthKey(range.start)
    .split("-")
    .map(Number);

  const [endYear, endMonth] = getMonthKey(range.end).split("-").map(Number);

  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));

  const end = new Date(Date.UTC(endYear, endMonth - 1, 1));

  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getUTCFullYear();

    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");

    const key = `${year}-${month}`;

    buckets.set(key, {
      month: key,
      label: monthLabelFormatter.format(cursor),
      totalOrders: 0,
      counts: new Map(),
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
}

// ==========================================
// MAIN CUSTOMER BREAKDOWN
// ==========================================
export function buildCustomerBreakdown(
  orders: AnalyticsOrder[],
  range: {
    start: Date;
    end: Date;
  },
): {
  regionData: CustomerRegionRow[];
  channelOrders: ChannelOrderChartData;
} {
  const regionMap = new Map<string, RegionAccumulator>();

  const channels = new Map<string, string>();

  const monthBuckets = createMonthBuckets(range);

  for (const order of orders) {
    // ==========================================
    // 1. CHANNEL ORDER PER MONTH
    // ==========================================
    const monthKey = getMonthKey(order.dateOrder);

    const month = monthBuckets.get(monthKey);

    const channelKey = order.purchaseChannel
      ? `channel_${order.purchaseChannel.id}`
      : "unassigned";

    const channelName = order.purchaseChannel?.name?.trim() || "Unassigned";

    if (month) {
      channels.set(channelKey, channelName);

      month.totalOrders += 1;

      month.counts.set(channelKey, (month.counts.get(channelKey) ?? 0) + 1);
    }

    // ==========================================
    // 2. CUSTOMER LOCATION
    // ==========================================
    if (!order.clientId || !order.client) {
      continue;
    }

    const location =
      order.client.type === "B2B" ? order.client.b2b : order.client.b2c;

    const country = normalizeLocation(location?.country, "Unknown Country");

    const region = normalizeLocation(location?.province, "Unknown Region");

    const city = normalizeLocation(location?.city, "Unknown City");

    // Menghindari collision antar kota,
    // provinsi dan negara yang namanya sama.
    const regionKey = JSON.stringify([
      country.toLowerCase(),
      region.toLowerCase(),
      city.toLowerCase(),
    ]);

    if (!regionMap.has(regionKey)) {
      regionMap.set(regionKey, {
        id: regionKey,
        country,
        region,
        city,
        customers: new Set<string>(),
        salesByCurrency: new Map(),
        lastOrder: order.dateOrder,
      });
    }

    const row = regionMap.get(regionKey)!;

    // Customer dihitung satu kali per lokasi,
    // meskipun memiliki beberapa order.
    row.customers.add(order.clientId);

    // ==========================================
    // 3. TOTAL SALES PER CURRENCY
    // ==========================================
    const currency = order.currencyCode.trim().toUpperCase();

    const previousAmount =
      row.salesByCurrency.get(currency) ?? new Prisma.Decimal(0);

    row.salesByCurrency.set(currency, previousAmount.plus(order.totalAmount));

    // ==========================================
    // 4. LAST ORDER
    // ==========================================
    if (order.dateOrder > row.lastOrder) {
      row.lastOrder = order.dateOrder;
    }
  }

  // ==========================================
  // FORMAT REGION RESPONSE
  // ==========================================
  const regionData: CustomerRegionRow[] = Array.from(regionMap.values())
    .map((row) => {
      const salesByCurrency = Object.fromEntries(
        Array.from(row.salesByCurrency.entries()).map(([currency, amount]) => [
          currency,
          amount.toNumber(),
        ]),
      );

      const currencies = Object.keys(salesByCurrency);

      const singleCurrency = currencies.length === 1 ? currencies[0] : null;

      return {
        id: row.id,
        country: row.country,
        region: row.region,
        city: row.city,

        totalCustomer: row.customers.size,

        // Hanya memiliki total tunggal
        // apabila mata uangnya sama.
        totalSales: singleCurrency ? salesByCurrency[singleCurrency] : null,

        currencyCode: singleCurrency,
        salesByCurrency,

        lastOrder: row.lastOrder.toISOString(),
      };
    })
    .sort(
      (a, b) =>
        a.country.localeCompare(b.country) ||
        a.region.localeCompare(b.region) ||
        a.city.localeCompare(b.city),
    );

  // ==========================================
  // FORMAT CHANNEL CHART RESPONSE
  // ==========================================
  const channelList = Array.from(channels.entries())
    .map(([key, name]) => ({
      key,
      name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));

  const months = Array.from(monthBuckets.values()).map((month) => ({
    month: month.month,
    label: month.label,
    totalOrders: month.totalOrders,

    // Channel yang tidak memiliki order
    // dalam suatu bulan mendapat nilai 0.
    counts: Object.fromEntries(
      channelList.map((channel) => [
        channel.key,
        month.counts.get(channel.key) ?? 0,
      ]),
    ),
  }));

  return {
    regionData,

    channelOrders: {
      channels: channelList,
      months,
    },
  };
}
