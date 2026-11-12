import { singleton } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { ConversionResult, ConvertCurrencyDTO } from "./dto/currency.dto";

type ExchangeRateResponse = {
  result: "success" | "error";
  "error-type"?: string;
  base_code?: string;
  conversion_rates?: Record<string, number>;
  time_last_update_unix?: number;
  time_next_update_unix?: number;
};

interface RatesCache {
  rates: Record<string, number>;
  fetchedAt: number;
  expiresAt: number;
  providerUpdatedAt: number | null;
}

@singleton()
export class CurrencyConversionService {
  private readonly BASE_CURRENCY = "USD";

  private readonly API_BASE_URL = "https://v6.exchangerate-api.com/v6";

  private readonly REQUEST_TIMEOUT_MS = 10_000;

  private readonly FALLBACK_CACHE_MS = 24 * 60 * 60 * 1000;

  private readonly MIN_CACHE_MS = 60 * 60 * 1000;

  private readonly MAX_CACHE_MS = 24 * 60 * 60 * 1000;

  private readonly CACHE_REFRESH_DELAY_MS = 5 * 60 * 1000;

  private ratesCache: RatesCache | null = null;

  private pendingRequest: Promise<RatesCache> | null = null;

  // =====================================================
  // CONVERT CURRENCY
  // =====================================================

  async convertCurrency(data: ConvertCurrencyDTO): Promise<ConversionResult> {
    const { fromCurrency, toCurrency, amount } = data;

    if (
      typeof fromCurrency !== "string" ||
      typeof toCurrency !== "string" ||
      typeof amount !== "number" ||
      !Number.isFinite(amount)
    ) {
      throw new ApiError(
        "fromCurrency, toCurrency, dan amount harus valid",
        400,
      );
    }

    if (amount < 0) {
      throw new ApiError("amount tidak boleh negatif", 400);
    }

    const from = fromCurrency.trim().toUpperCase();
    const to = toCurrency.trim().toUpperCase();

    const currencyPattern = /^[A-Z]{3}$/;

    if (!currencyPattern.test(from) || !currencyPattern.test(to)) {
      throw new ApiError("Kode mata uang harus terdiri dari 3 huruf", 400);
    }

    // Tidak membutuhkan external API.
    if (from === to) {
      return {
        success: true,
        fromCurrency: from,
        toCurrency: to,
        originalAmount: amount,
        convertedAmount: Number(amount.toFixed(2)),
        rate: 1,
        timestamp: new Date().toISOString(),
        source: "same-currency",
      };
    }

    // Ambil satu tabel rates berbasis USD.
    const cache = await this.getRates();

    const fromRate = cache.rates[from];
    const toRate = cache.rates[to];

    if (
      !Number.isFinite(fromRate) ||
      !Number.isFinite(toRate) ||
      fromRate <= 0 ||
      toRate <= 0
    ) {
      throw new ApiError(
        `Pasangan mata uang ${from}/${to} tidak didukung`,
        400,
      );
    }

    // Cross-rate:
    // USD -> IDR = 16000
    // USD -> EUR = 0.90
    // IDR -> EUR = 0.90 / 16000
    const conversionRate = toRate / fromRate;

    const convertedAmount = amount * conversionRate;

    if (
      !Number.isFinite(conversionRate) ||
      conversionRate <= 0 ||
      !Number.isFinite(convertedAmount)
    ) {
      throw new ApiError("Hasil perhitungan kurs tidak valid", 422);
    }

    return {
      success: true,
      fromCurrency: from,
      toCurrency: to,
      originalAmount: amount,
      convertedAmount: Number(convertedAmount.toFixed(2)),

      // Jangan gunakan toFixed(6).
      // Kurs IDR -> USD sangat kecil dan membutuhkan
      // presisi lebih tinggi.
      rate: Number(conversionRate.toPrecision(12)),

      timestamp: cache.providerUpdatedAt
        ? new Date(cache.providerUpdatedAt).toISOString()
        : new Date(cache.fetchedAt).toISOString(),

      source: "ExchangeRate-API",
    };
  }

  // =====================================================
  // GET EXCHANGE RATES
  // =====================================================

  private async getRates(): Promise<RatesCache> {
    const now = Date.now();

    // 1. Fresh cache.
    if (this.ratesCache && now < this.ratesCache.expiresAt) {
      return this.ratesCache;
    }

    // 2. Deduplicate concurrent requests.
    if (this.pendingRequest) {
      return this.pendingRequest;
    }

    // 3. Fetch only once per cache refresh.
    const request = this.fetchRates();

    this.pendingRequest = request;

    try {
      return await request;
    } finally {
      if (this.pendingRequest === request) {
        this.pendingRequest = null;
      }
    }
  }

  // =====================================================
  // FETCH PROVIDER
  // =====================================================

  private async fetchRates(): Promise<RatesCache> {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY?.trim();

    if (!apiKey) {
      throw new ApiError("EXCHANGE_RATE_API_KEY belum dikonfigurasi", 500);
    }

    // Bearer auth supaya API key tidak muncul di URL.
    const url = `${this.API_BASE_URL}/latest/${this.BASE_CURRENCY}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      console.error("[Currency] Network/timeout error:", error);

      throw new ApiError("Provider kurs sedang tidak dapat diakses", 503);
    }

    if (response.status === 429) {
      throw new ApiError("Provider kurs sedang membatasi jumlah request", 503);
    }

    if (!response.ok) {
      console.error("[Currency] Provider HTTP error:", response.status);

      throw new ApiError("Gagal mengambil data kurs dari provider", 503);
    }

    let data: ExchangeRateResponse;

    try {
      data = (await response.json()) as ExchangeRateResponse;
    } catch {
      throw new ApiError("Respons provider kurs tidak valid", 502);
    }

    if (data.result !== "success") {
      const errorType = data["error-type"] ?? "unknown-error";

      console.error("[Currency] Provider error type:", errorType);

      if (errorType === "invalid-key" || errorType === "inactive-account") {
        throw new ApiError("Konfigurasi akun provider kurs tidak valid", 503);
      }

      if (errorType === "quota-reached") {
        throw new ApiError("Kuota provider kurs telah habis", 503);
      }

      throw new ApiError("Provider kurs gagal memproses permintaan", 503);
    }

    if (
      data.base_code !== this.BASE_CURRENCY ||
      !data.conversion_rates ||
      typeof data.conversion_rates !== "object"
    ) {
      throw new ApiError("Struktur data kurs tidak sesuai", 502);
    }

    const rates: Record<string, number> = Object.create(null);

    for (const [currency, value] of Object.entries(data.conversion_rates)) {
      if (
        /^[A-Z]{3}$/.test(currency) &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value > 0
      ) {
        rates[currency] = value;
      }
    }

    // Pastikan base rate selalu tepat 1.
    rates[this.BASE_CURRENCY] = 1;

    if (!rates.IDR || !rates.USD || Object.keys(rates).length < 2) {
      throw new ApiError("Data kurs utama dari provider tidak lengkap", 502);
    }

    const fetchedAt = Date.now();

    const providerUpdatedAt =
      typeof data.time_last_update_unix === "number" &&
      Number.isFinite(data.time_last_update_unix)
        ? data.time_last_update_unix * 1000
        : null;

    const nextUpdate =
      typeof data.time_next_update_unix === "number" &&
      Number.isFinite(data.time_next_update_unix)
        ? data.time_next_update_unix * 1000
        : fetchedAt + this.FALLBACK_CACHE_MS;

    // Cache hingga pembaruan berikutnya,
    // dengan batas minimum dan maksimum.
    const requestedExpiry = nextUpdate + this.CACHE_REFRESH_DELAY_MS;

    const expiresAt = Math.max(
      fetchedAt + this.MIN_CACHE_MS,
      Math.min(fetchedAt + this.MAX_CACHE_MS, requestedExpiry),
    );

    this.ratesCache = {
      rates,
      fetchedAt,
      expiresAt,
      providerUpdatedAt,
    };

    console.info("[Currency] Rates refreshed", {
      base: this.BASE_CURRENCY,
      currencies: Object.keys(rates).length,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return this.ratesCache;
  }

  // =====================================================
  // CLEAR CACHE
  // =====================================================

  clearCache(baseCurrency?: string): void {
    if (baseCurrency && baseCurrency.toUpperCase() !== this.BASE_CURRENCY) {
      // Semua mata uang menggunakan satu base USD.
      // Clearing currency spesifik tidak diperlukan.
      return;
    }

    this.ratesCache = null;
  }

  // =====================================================
  // CACHE STATS
  // =====================================================

  getCacheStats() {
    return {
      baseCurrency: this.BASE_CURRENCY,
      cachedCurrencies: this.ratesCache
        ? Object.keys(this.ratesCache.rates)
        : [],
      cacheSize: this.ratesCache
        ? Object.keys(this.ratesCache.rates).length
        : 0,
      cacheDurationMinutes: this.MAX_CACHE_MS / 60000,
      fetchedAt: this.ratesCache
        ? new Date(this.ratesCache.fetchedAt).toISOString()
        : null,
      expiresAt: this.ratesCache
        ? new Date(this.ratesCache.expiresAt).toISOString()
        : null,
      providerUpdatedAt: this.ratesCache?.providerUpdatedAt
        ? new Date(this.ratesCache.providerUpdatedAt).toISOString()
        : null,
      isFetching: this.pendingRequest !== null,
    };
  }
}
