interface WilayahItem {
  code: string;
  name: string;
}

interface WilayahResponse {
  data: WilayahItem[];
  meta: {
    administrative_area_level: number;
    updated_at: string;
  };
}

export class WilayahService {
  private readonly API_URL = "https://wilayah.id/api";
  private cache: Map<string, { data: WilayahItem[]; timestamp: number }> =
    new Map();
  private CACHE_DURATION = 1000 * 60 * 60; // 1 hour

  /**
   * Get cache key and check if valid
   */
  private getCachedData(key: string): WilayahItem[] | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    // Clear expired cache
    if (cached) this.cache.delete(key);
    return null;
  }

  /**
   * Set cache data
   */
  private setCachedData(key: string, data: WilayahItem[]) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Generic fetch helper
   */
  private async fetchWilayah(
    path: string,
    cacheKey: string,
  ): Promise<WilayahItem[]> {
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    const response = await fetch(`${this.API_URL}/${path}`);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const json: WilayahResponse = await response.json();

    if (!json.data || !Array.isArray(json.data)) {
      throw new Error("Invalid response format from API");
    }

    const formatted = json.data.map((item) => ({
      code: item.code,
      name: item.name,
    }));

    this.setCachedData(cacheKey, formatted);
    return formatted;
  }

  /**
   * Fetch provinces
   * GET https://wilayah.id/api/provinces.json
   */
  async getProvinces(): Promise<WilayahItem[]> {
    try {
      return await this.fetchWilayah("provinces.json", "provinces");
    } catch (error) {
      console.error("Error fetching provinces:", error);
      throw new Error("Failed to fetch provinces data");
    }
  }

  /**
   * Fetch cities/regencies by province code
   * GET https://wilayah.id/api/regencies/[PROVINCE_CODE].json
   */
  async getRegencies(provinceCode: string): Promise<WilayahItem[]> {
    try {
      return await this.fetchWilayah(
        `regencies/${provinceCode}.json`,
        `regencies_${provinceCode}`,
      );
    } catch (error) {
      console.error(
        `Error fetching regencies for province ${provinceCode}:`,
        error,
      );
      throw new Error("Failed to fetch cities/regencies data");
    }
  }

  /**
   * Fetch districts by regency code
   * GET https://wilayah.id/api/districts/[REGENCY_CODE].json
   */
  async getDistricts(regencyCode: string): Promise<WilayahItem[]> {
    try {
      return await this.fetchWilayah(
        `districts/${regencyCode}.json`,
        `districts_${regencyCode}`,
      );
    } catch (error) {
      console.error(
        `Error fetching districts for regency ${regencyCode}:`,
        error,
      );
      throw new Error("Failed to fetch districts data");
    }
  }

  /**
   * Fetch villages by district code
   * GET https://wilayah.id/api/villages/[DISTRICT_CODE].json
   */
  async getVillages(districtCode: string): Promise<WilayahItem[]> {
    try {
      return await this.fetchWilayah(
        `villages/${districtCode}.json`,
        `villages_${districtCode}`,
      );
    } catch (error) {
      console.error(
        `Error fetching villages for district ${districtCode}:`,
        error,
      );
      throw new Error("Failed to fetch villages data");
    }
  }
}
