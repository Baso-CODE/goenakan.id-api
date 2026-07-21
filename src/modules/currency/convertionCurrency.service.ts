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
  // Pastikan URL API dasar benar (terkadang versi berbayar/baru menggunakan endpoint yang berbeda, tapi kita ikuti error log kamu)
  private readonly EXCHANGERATE_API = "https://api.exchangerate.host/";
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
      if (error instanceof ApiError) {
        throw error;
      }

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

    // Cek cache apakah masih valid (kurang dari 30 menit)
    if (cached && now - cached.timestamp < this.CACHE_DURATION) {
      console.log(`[✅ Cache Hit] Using cached rates for ${baseCurrency}`);
      return cached.rates;
    }

    console.log(
      `[🔄 Cache Miss] Fetching fresh rates for ${baseCurrency} from exchangerate.host`,
    );

    try {
      const apiKey = process.env.EXCHANGE_RATE_API_KEY;

      if (!apiKey) {
        throw new Error(
          "API Key tidak ditemukan. Pastikan EXCHANGE_RATE_API_KEY sudah ditambahkan di file .env",
        );
      }

      // Menerapkan URL persis seperti di dokumentasi: /live?access_key=YOUR_KEY
      // Kita tambahkan parameter &source= untuk menentukan mata uang dasar (misal: IDR)
      const url = `${this.EXCHANGERATE_API}/live?access_key=${apiKey}&source=${baseCurrency}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `API error: ${response.status} ${response.statusText} saat mengakses ${url}`,
        );
      }

      const data = await response.json();

      // Menangkap pesan error spesifik dari API jika format atau kunci salah
      if (!data.success) {
        throw new Error(
          data.error?.info ||
            `Gagal mengambil data dari API: Kode Error ${data.error?.code}`,
        );
      }

      let formattedRates: Record<string, number> = {};

      // Menyesuaikan format JSON yang dikembalikan oleh API
      if (data.quotes) {
        // Format baru: { "USDIDR": 15000, "USDEUR": 0.85 }
        for (const key in data.quotes) {
          // Menghapus nama mata uang dasar agar "IDRUSD" hanya menjadi "USD"
          const targetCurrency = key.replace(baseCurrency, "");
          formattedRates[targetCurrency] = data.quotes[key];
        }
      } else if (data.rates) {
        // Format lama: { "IDR": 15000, "EUR": 0.85 }
        formattedRates = data.rates;
      } else {
        throw new Error(
          "Format respons API tidak dikenali (tidak ada objek 'rates' atau 'quotes').",
        );
      }

      // Simpan ke memori (cache) agar tidak boros kuota API
      this.ratesCache[baseCurrency] = {
        rates: formattedRates,
        timestamp: now,
      };

      console.log(
        `[💾 Cache Set] Rates for ${baseCurrency} berhasil disimpan.`,
      );

      return formattedRates;
    } catch (error: any) {
      console.error("Failed to fetch rates:", error);
      throw new Error(
        error.message ||
          "Gagal mengambil data dari exchangerate.host. Silakan coba lagi.",
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
