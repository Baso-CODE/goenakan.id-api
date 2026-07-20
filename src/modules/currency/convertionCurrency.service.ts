import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { ConversionResult, ConvertCurrencyDTO } from "./dto/currency.dto";

interface RatesCache {
  [key: string]: {
    rates: Record<string, number>;
    timestamp: number;
  };
}

@injectable()
export class CurrencyConversionService {
  private readonly EXCHANGERATE_API = "https://api.exchangerate.host";
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 menit
  private readonly ratesCache: RatesCache = {};

  async convertCurrency(data: ConvertCurrencyDTO): Promise<ConversionResult> {
    const { fromCurrency, toCurrency, amount } = data;

    // 1. Validasi input
    if (
      !fromCurrency ||
      !toCurrency ||
      amount === undefined ||
      amount === null
    ) {
      throw new ApiError("fromCurrency, toCurrency, dan amount harus ada", 400);
    }

    if (amount < 0) {
      throw new ApiError("amount tidak boleh negatif", 400);
    }

    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    // 2. Jika same currency, return as-is (tanpa API call)
    if (from === to) {
      return {
        success: true,
        fromCurrency: from,
        toCurrency: to,
        originalAmount: amount,
        convertedAmount: parseFloat(amount.toFixed(2)),
        rate: 1,
        timestamp: new Date().toISOString(),
        source: "exchangerate.host (same currency)",
      };
    }

    try {
      // 3. Ambil rates (dari cache atau fetch baru dari API)
      const rates = await this.getRates(from);

      // 4. Cek apakah toCurrency tersedia
      if (!rates[to]) {
        throw new ApiError(
          `Currency '${to}' tidak ditemukan atau tidak tersedia di exchangerate.host`,
          400,
        );
      }

      // 5. Hitung conversion
      // Formula: amount * rate_to
      // (Rate dari API sudah normalized terhadap base currency)
      const rateToTarget = rates[to];
      const convertedAmount = amount * rateToTarget;

      return {
        success: true,
        fromCurrency: from,
        toCurrency: to,
        originalAmount: amount,
        convertedAmount: parseFloat(convertedAmount.toFixed(2)),
        rate: parseFloat(rateToTarget.toFixed(6)),
        timestamp: new Date().toISOString(),
        source: "exchangerate.host",
      };
    } catch (error: any) {
      // Jika error dari ApiError, throw as-is
      if (error instanceof ApiError) {
        throw error;
      }

      // Jika error lain, wrap as API error
      console.error("Currency conversion error:", error);
      throw new ApiError(
        error.message || "Gagal mengkonversi currency. Silakan coba lagi.",
        500,
      );
    }
  }

  private async getRates(
    baseCurrency: string,
  ): Promise<Record<string, number>> {
    const now = Date.now();
    const cached = this.ratesCache[baseCurrency];

    // Cek cache apakah masih valid
    if (cached && now - cached.timestamp < this.CACHE_DURATION) {
      console.log(`[✅ Cache Hit] Using cached rates for ${baseCurrency}`);
      return cached.rates;
    }

    // Cache miss - fetch baru dari API
    console.log(
      `[🔄 Cache Miss] Fetching fresh rates for ${baseCurrency} from exchangerate.host`,
    );

    try {
      const response = await fetch(
        `${this.EXCHANGERATE_API}/latest?base=${baseCurrency}`,
      );

      if (!response.ok) {
        throw new Error(
          `exchangerate.host API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      // Validasi response dari API
      if (!data.success) {
        throw new Error(
          data.error?.info || `Invalid base currency: ${baseCurrency}`,
        );
      }

      if (!data.rates || typeof data.rates !== "object") {
        throw new Error("Invalid rates response from exchangerate.host");
      }

      // Simpan ke cache
      this.ratesCache[baseCurrency] = {
        rates: data.rates,
        timestamp: now,
      };

      console.log(
        `[💾 Cache Set] Rates for ${baseCurrency} cached for 30 minutes`,
      );

      return data.rates;
    } catch (error: any) {
      console.error("Failed to fetch rates from exchangerate.host:", error);
      throw new Error(
        error.message ||
          "Gagal fetch rates dari exchangerate.host. Silakan coba lagi.",
      );
    }
  }

  clearCache(baseCurrency?: string): void {
    if (baseCurrency) {
      delete this.ratesCache[baseCurrency];
      console.log(`Cache cleared for ${baseCurrency}`);
    } else {
      Object.keys(this.ratesCache).forEach(
        (key) => delete this.ratesCache[key],
      );
      console.log("All currency rates cache cleared");
    }
  }

  getCacheStats() {
    return {
      cachedCurrencies: Object.keys(this.ratesCache),
      cacheSize: Object.keys(this.ratesCache).length,
      cacheDurationMinutes: this.CACHE_DURATION / 60000,
    };
  }
}
