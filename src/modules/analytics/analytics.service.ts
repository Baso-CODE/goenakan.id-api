import { injectable } from "tsyringe";
import { PrismaService } from "../prisma/prisma.service";

// Interface parameter filter dari frontend
export interface AnalyticsFilterQuery {
  range: string;
  startDate?: string;
  endDate?: string;
}

@injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}
  // =========================================================================
  // FUNGSI UNTUK TAB 2: SALES OVERVIEW
  // =========================================================================
  async getSalesOverviewData(query: AnalyticsFilterQuery) {
    // 1. Tentukan rentang waktu pencarian
    const { start, end } = this.calculateDateRange(query);

    // 2. Tarik semua pesanan beserta detail produk dan profitnya
    const orders = await this.prisma.order.findMany({
      where: {
        dateOrder: { gte: start, lte: end },
        status: { not: "CANCELLED" },
      },
      include: {
        products: {
          include: {
            product: {
              include: {
                category: true,
                itemCategory: true,
              },
            },
          },
        },
        cashflowSummary: true,
      },
      orderBy: { dateOrder: "asc" },
    });

    // 3. SIAPKAN VARIABEL PENAMPUNG HASIL
    let totalRevenue = 0;
    let totalProfit = 0;
    const trendMap = new Map<string, any>();
    const categoryMap = new Map<string, number>();

    // ✨ UPDATE 1: Siapkan penampung untuk "All Categories" dan "Per Kategori"
    const itemMapGlobal = new Map<string, number>();
    const itemMapNested = new Map<string, Map<string, number>>();

    const productSalesMap = new Map<
      string,
      { sku: string; name: string; totalOrder: number; totalRevenue: number }
    >();

    // 4. MULAI MENGHITUNG DAN MENGELOMPOKKAN DATA
    for (const order of orders) {
      const orderRevenue = Number(order.totalAmount);
      totalRevenue += orderRevenue;

      const orderProfit = 0;
      totalProfit += orderProfit;

      const dateKey = order.dateOrder.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
      });

      if (!trendMap.has(dateKey)) {
        trendMap.set(dateKey, {
          month: dateKey,
          revenue: 0,
          order: 0,
          profit: 0,
        });
      }
      const trendData = trendMap.get(dateKey);
      trendData.revenue += orderRevenue;
      trendData.order += 1;
      trendData.profit += orderProfit;

      for (const item of order.products) {
        const itemRevenue = Number(item.unitPrice) * item.quantity;
        const categoryName = item.product?.category?.name_id || "Uncategorized";
        const itemCatName = item.product?.itemCategory?.name || "Uncategorized";

        // A. Akumulasi untuk Product Category (Kiri)
        categoryMap.set(
          categoryName,
          (categoryMap.get(categoryName) || 0) + itemRevenue,
        );

        // ✨ UPDATE 2: Akumulasi Item Category (Global/All)
        itemMapGlobal.set(
          itemCatName,
          (itemMapGlobal.get(itemCatName) || 0) + itemRevenue,
        );

        // ✨ UPDATE 3: Akumulasi Item Category (Spesifik per Product Category)
        if (!itemMapNested.has(categoryName)) {
          itemMapNested.set(categoryName, new Map<string, number>());
        }
        const specificCategoryMap = itemMapNested.get(categoryName)!;
        specificCategoryMap.set(
          itemCatName,
          (specificCategoryMap.get(itemCatName) || 0) + itemRevenue,
        );

        // B. Akumulasi untuk Stacked Bar Chart
        trendData[categoryName] = (trendData[categoryName] || 0) + itemRevenue;

        // C. Akumulasi untuk Top/Bottom Products
        const productName = item.product?.name || "Unknown Product";
        const productSku = item.product?.sku || "NO-SKU";

        if (!productSalesMap.has(productSku)) {
          productSalesMap.set(productSku, {
            sku: productSku,
            name: productName,
            totalOrder: 0,
            totalRevenue: 0,
          });
        }
        const productStats = productSalesMap.get(productSku)!;
        productStats.totalOrder += item.quantity;
        productStats.totalRevenue += itemRevenue;
      }
    }

    // 5. UBAH MAP MENJADI ARRAY & OBJECT AGAR MUDAH DIBACA FRONTEND
    const trendGraphData = Array.from(trendMap.values());
    const categoryPieData = Array.from(categoryMap.entries()).map(
      ([name, value]) => ({ name, value }),
    );

    // ✨ UPDATE 4: Susun objek item kategori agar memiliki opsi "all" dan opsi nama kategorinya
    const itemCategoriesData: Record<string, any[]> = {
      all: Array.from(itemMapGlobal.entries()).map(([name, value]) => ({
        name,
        value,
      })),
    };

    for (const [catName, itemsMap] of itemMapNested.entries()) {
      itemCategoriesData[catName] = Array.from(itemsMap.entries()).map(
        ([name, value]) => ({ name, value }),
      );
    }

    const allProductsArray = Array.from(productSalesMap.values());
    allProductsArray.sort((a, b) => b.totalOrder - a.totalOrder);

    const top5Products = allProductsArray.slice(0, 5);
    const bottom5Products = allProductsArray.slice(-5).reverse();

    // 6. KEMBALIKAN SEMUA DATA DALAM SATU STRUKTUR JSON
    return {
      metrics: {
        revenue: totalRevenue,
        orders: orders.length,
        averagePurchase: orders.length > 0 ? totalRevenue / orders.length : 0,
        profit: totalProfit,
      },
      graphs: {
        trend: trendGraphData,
      },
      pieCharts: {
        productCategories: categoryPieData,
        itemCategories: itemCategoriesData, // ✨ Mengirimkan Object (bukan Array lagi)
      },
      productsPerformance: {
        top: top5Products,
        bottom: bottom5Products,
      },
      period: { start, end },
    };
  }

  // =========================================================================
  // FUNGSI UNTUK TAB 3: CUSTOMER ANALYTIC
  // =========================================================================
  async getCustomerAnalyticsData(query: AnalyticsFilterQuery) {
    const { start, end } = this.calculateDateRange(query);

    // 1. Tarik semua pesanan beserta data Client-nya
    const orders = await this.prisma.order.findMany({
      where: {
        dateOrder: { gte: start, lte: end },
        status: { not: "CANCELLED" },
      },
      include: {
        client: {
          // ✨ PERBAIKAN 1: Ambil juga data relasi B2B dan B2C untuk mendapatkan alamat/Region
          include: {
            b2b: true,
            b2c: true,
          },
        },
      },
      orderBy: { dateOrder: "asc" },
    });

    // 2. Cari tahu kapan "Pesanan Pertama" untuk masing-masing klien
    const clientIds = Array.from(
      new Set(orders.map((o) => o.clientId).filter(Boolean)),
    ) as string[];

    const firstOrderDates = await this.prisma.order.groupBy({
      by: ["clientId"],
      where: {
        clientId: { in: clientIds },
        status: { not: "CANCELLED" },
      },
      _min: { dateOrder: true },
    });

    const firstOrderMap = new Map<string, number>();
    for (const f of firstOrderDates) {
      if (f.clientId && f._min.dateOrder) {
        firstOrderMap.set(f.clientId, f._min.dateOrder.getTime());
      }
    }

    // 3. SIAPKAN VARIABEL PENAMPUNG HASIL
    let totalRevenue = 0;

    // ✨ PERBAIKAN 2: Menggunakan Set agar bisa menghitung pelanggan yang sama jika dia pesan > 1 kali
    const newCustomersThisPeriod = new Set<string>();
    const returningCustomersThisPeriod = new Set<string>();
    const processedClients = new Set<string>();

    const monthlyMap = new Map<string, any>();
    const regionMap = new Map<string, any>();

    // 4. MULAI MENGHITUNG DATA
    for (const order of orders) {
      if (!order.clientId || !order.client) continue;

      const orderRevenue = Number(order.totalAmount || 0);
      totalRevenue += orderRevenue;

      const firstOrderTime = firstOrderMap.get(order.clientId) || 0;
      const currentOrderTime = order.dateOrder.getTime();

      // A. METRIK KESELURUHAN (Hitung pelanggan unik)
      processedClients.add(order.clientId);

      // ✨ LOGIKA BARU: Penentuan New vs Returning yang lebih akurat
      if (currentOrderTime === firstOrderTime) {
        // Jika ini adalah pesanan paling pertama baginya, dia adalah New Customer
        newCustomersThisPeriod.add(order.clientId);
      } else if (currentOrderTime > firstOrderTime) {
        // Jika ini bukan pesanan pertamanya (dia sudah pernah pesan sebelumnya), dia adalah Returning
        returningCustomersThisPeriod.add(order.clientId);
      }

      // B. GRAFIK BULANAN (Untuk Perbandingan & Retensi)
      const monthKey = order.dateOrder.toLocaleDateString("en-US", {
        month: "short",
      });
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          month: monthKey,
          newOrderCount: 0,
          repeatOrderCount: 0,
          newSales: 0,
          repeatSales: 0,
        });
      }

      const monthData = monthlyMap.get(monthKey);
      const isThisOrderTheFirst = firstOrderTime === currentOrderTime;

      if (isThisOrderTheFirst) {
        monthData.newOrderCount++;
        monthData.newSales += orderRevenue;
      } else {
        monthData.repeatOrderCount++;
        monthData.repeatSales += orderRevenue;
      }

      // C. REGION DATA (Tabel Bawah)
      const clientData = order.client;
      let regionName = "Unknown Region";

      // ✨ PERBAIKAN 3: Membaca alamat/region dari relasi B2B atau B2C sesuai tipenya
      if (clientData.type === "B2B" && clientData.b2b) {
        regionName =
          clientData.b2b.city ||
          clientData.b2b.province ||
          "Unknown Region (B2B)";
      } else if (clientData.type === "B2C" && clientData.b2c) {
        regionName =
          clientData.b2c.city ||
          clientData.b2c.province ||
          "Unknown Region (B2C)";
      }

      if (!regionMap.has(regionName)) {
        regionMap.set(regionName, {
          id: regionName,
          region: regionName,
          totalCustomerSet: new Set<string>(),
          totalSales: 0,
          lastOrder: order.dateOrder,
        });
      }
      const regData = regionMap.get(regionName);
      regData.totalCustomerSet.add(order.clientId);
      regData.totalSales += orderRevenue;
      if (order.dateOrder > regData.lastOrder) {
        regData.lastOrder = order.dateOrder;
      }
    }

    // 5. KALKULASI HASIL AKHIR
    const totalUniqueCustomers = processedClients.size;
    const clv =
      totalUniqueCustomers > 0 ? totalRevenue / totalUniqueCustomers : 0;
    const cac = 0;

    const comparisonGraph = [];
    const retentionGraph = [];

    for (const data of monthlyMap.values()) {
      const totalOrdersInMonth = data.newOrderCount + data.repeatOrderCount;
      const newOrderPct =
        totalOrdersInMonth > 0
          ? (data.newOrderCount / totalOrdersInMonth) * 100
          : 0;
      const repeatOrderPct =
        totalOrdersInMonth > 0
          ? (data.repeatOrderCount / totalOrdersInMonth) * 100
          : 0;

      const avgSalesNew =
        data.newOrderCount > 0 ? data.newSales / data.newOrderCount : 0;
      const avgSalesRepeat =
        data.repeatOrderCount > 0
          ? data.repeatSales / data.repeatOrderCount
          : 0;

      comparisonGraph.push({
        month: data.month,
        newOrderPct: Number(newOrderPct.toFixed(1)),
        repeatOrderPct: Number(repeatOrderPct.toFixed(1)),
        avgSalesNew: Number(avgSalesNew.toFixed(0)),
        avgSalesRepeat: Number(avgSalesRepeat.toFixed(0)),
      });

      const pseudoChurn =
        totalOrdersInMonth > 0 ? (100 - repeatOrderPct) / 2 : 0;

      retentionGraph.push({
        month: data.month,
        repeatRate: Number(repeatOrderPct.toFixed(1)),
        churnRate: Number(pseudoChurn.toFixed(1)),
      });
    }

    const regionDataArray = Array.from(regionMap.values()).map((r) => ({
      id: r.id,
      region: r.region,
      totalCustomer: r.totalCustomerSet.size,
      totalSales: r.totalSales,
      lastOrder: r.lastOrder.toISOString(),
    }));

    // 6. KEMBALIKAN KE FRONTEND
    return {
      metrics: {
        // ✨ Gunakan .size pada Set untuk mendapatkan jumlah uniknya
        newCustomer: newCustomersThisPeriod.size,
        returningCustomer: returningCustomersThisPeriod.size,
        clv: clv,
        cac: cac,
      },
      graphs: {
        retention: retentionGraph,
        comparison: comparisonGraph,
      },
      regionData: regionDataArray,
      period: { start, end },
    };
  }
  // =========================================================================
  // FUNGSI HELPER: MENGUBAH PARAMETER "RANGE" MENJADI TANGGAL AKTUAL
  // =========================================================================
  private calculateDateRange(query: AnalyticsFilterQuery) {
    const end = new Date(); // Hari ini saat ini juga
    let start = new Date();
    start.setHours(0, 0, 0, 0); // Mulai dari jam 00:00 pagi ini

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
}
