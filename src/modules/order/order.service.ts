import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrderDTO } from "./dto/createOrder.dto";

type OrderProductInput = {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  customization?: string;
  remarks?: string;
};

export interface OrderExportQuery {
  startDate?: string;
  endDate?: string;
  search?: string;
  salesCategory?: string;
}

@injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  async createOrder(data: CreateOrderDTO) {
    const {
      vendorIds,
      products,
      clientB2BPICId,
      purchaseChannelId,
      ...orderCore
    } = data;

    let totalAmount = 0;
    const orderProductsData: any[] = []; // Array untuk menampung semua product

    // 1. LOOP PRODUCT: Siapkan data product & hitung total amount
    for (const item of products) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          productVariants: true,
          priceTiers: { orderBy: { minQuantity: "desc" } },
        },
      });

      if (!product) {
        throw new ApiError(`Product with ID ${item.productId} not found`, 404);
      }

      let finalPrice = 0;

      // Logika Harga (Custom vs Base Price/Tier)
      if (product.isCustom) {
        if (!item.variantId) {
          throw new ApiError(
            `Variant is required for custom product: ${product.name}`,
            400,
          );
        }
        const variant = product.productVariants.find(
          (v) => v.id === item.variantId,
        );
        if (!variant || !variant.price) {
          throw new ApiError(
            `Invalid variant for product: ${product.name}`,
            400,
          );
        }
        finalPrice = Number(variant.price);
      } else {
        finalPrice = product.basePrice;
        if (product.priceTiers && product.priceTiers.length > 0) {
          const applicableTier = product.priceTiers.find(
            (t) => item.quantity >= t.minQuantity,
          );
          if (applicableTier) {
            finalPrice = Number(applicableTier.price);
          }
        }
      }

      // Tambah ke Total Amount Order
      const subtotal = finalPrice * item.quantity;
      totalAmount += subtotal;

      // Siapkan object untuk Prisma Create
      const productData: any = {
        product: { connect: { id: item.productId } },
        quantity: item.quantity,
        unitPrice: finalPrice,
        variant: item.variantId
          ? { connect: { id: item.variantId } }
          : undefined,
      };

      if (item.customization) {
        productData.customization = JSON.stringify({
          detail: item.customization,
        });
      }
      if (item.remarks) {
        productData.remarks = item.remarks;
      }

      // PUSH ke array (JANGAN create dulu)
      orderProductsData.push(productData);
    }
    // --- AKHIR LOOP PRODUCT ---

    // 2. SIAPKAN VENDOR (Di luar loop product agar tidak duplikat)
    const vendorsToConnect: any[] = [];
    if (vendorIds && vendorIds.length > 0) {
      const vendors = await this.prisma.vendor.findMany({
        where: { id: { in: vendorIds } },
        include: { contacts: true },
      });

      for (const v of vendors) {
        const phone = v.contacts.length > 0 ? v.contacts[0].contactId : "-"; // Asumsi contactId menyimpan phone/email string? Sesuaikan fieldnya

        vendorsToConnect.push({
          vendor: { connect: { id: v.id } },
          vendorPicName: v.picName || "Unknown PIC",
          vendorPicPhone: phone,
          roleInOrder: "Supplier",
        });
      }
    }

    // 3. EKSEKUSI DATABASE TRANSACTION (Create Order Sekali Saja)
    const newOrder = await this.prisma.$transaction(async (tx) => {
      const connectRelations: any = {};

      if (clientB2BPICId) {
        connectRelations.pic = { connect: { id: clientB2BPICId } };
      }

      if (purchaseChannelId) {
        connectRelations.purchaseChannel = {
          connect: { id: purchaseChannelId },
        };
      }

      const order = await tx.order.create({
        data: {
          dateOrder: new Date(orderCore.dateOrder),
          salesCategory: orderCore.salesCategory,
          poNumber: orderCore.poNumber,
          shippingAddress: orderCore.shippingAddress,
          totalAmount: totalAmount, // Total yang sudah dihitung di loop

          client: { connect: { id: orderCore.clientId } },
          sales: { connect: { id: orderCore.salesId } },
          ...connectRelations,

          // Masukkan array items yang sudah dikumpulkan
          products: {
            create: orderProductsData,
          },

          // Masukkan array vendors yang sudah dikumpulkan
          vendors: {
            create: vendorsToConnect,
          },
        },
        include: {
          products: true,
          vendors: true,
          client: {
            include: {
              b2b: { include: { pics: true } },
            },
          },
          purchaseChannel: true,
        },
      });

      return order;
    });

    return newOrder;
  }
  // === UPDATE ORDER ===
  async updateOrder(id: string, data: CreateOrderDTO) {
    const {
      vendorIds,
      products,
      clientB2BPICId, // <-- Tangkap field baru
      purchaseChannelId, // <-- Tangkap field baru
      ...orderCore
    } = data;

    // 1. Cek apakah Order Exist
    const existingOrder = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    // 2. Hitung Ulang Total & Siapkan Data Produk Baru
    let totalAmount = 0;
    const orderProductsData: any[] = [];

    for (const item of products) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          productVariants: true,
          priceTiers: { orderBy: { minQuantity: "desc" } },
        },
      });

      if (!product) {
        throw new ApiError(`Product with ID ${item.productId} not found`, 404);
      }

      let finalPrice = 0;

      // Logika Harga Custom vs Standard
      if (product.isCustom) {
        if (!item.variantId) {
          throw new ApiError(
            `Variant is required for custom product: ${product.name}`,
            400,
          );
        }
        const variant = product.productVariants.find(
          (v) => v.id === item.variantId,
        );
        if (!variant || !variant.price) {
          throw new ApiError(
            `Invalid variant for product: ${product.name}`,
            400,
          );
        }
        finalPrice = Number(variant.price);
      } else {
        finalPrice = product.basePrice;
        if (product.priceTiers && product.priceTiers.length > 0) {
          const applicableTier = product.priceTiers.find(
            (t) => item.quantity >= t.minQuantity,
          );
          if (applicableTier) {
            finalPrice = Number(applicableTier.price);
          }
        }
      }

      const subtotal = finalPrice * item.quantity;
      totalAmount += subtotal;

      // Siapkan payload produk
      const productData: any = {
        product: { connect: { id: item.productId } },
        quantity: item.quantity,
        unitPrice: finalPrice,
        variant: item.variantId
          ? { connect: { id: item.variantId } }
          : undefined,
      };

      // Handle Optional Fields
      if (item.customization) {
        productData.customization = JSON.stringify({
          detail: item.customization,
        });
      }

      if (item.remarks) {
        productData.remarks = item.remarks;
      }

      // PUSH HARUS SELALU DIJALANKAN (Fix Bug Sebelumnya)
      orderProductsData.push(productData);
    }

    // 3. Siapkan Data Vendor Baru
    const vendorsToConnect: any[] = [];
    if (vendorIds && vendorIds.length > 0) {
      const vendors = await this.prisma.vendor.findMany({
        where: { id: { in: vendorIds } },
        include: { contacts: true },
      });

      for (const v of vendors) {
        const phone =
          v.contacts.length > 0 ? (v.contacts[0] as any).contactId || "-" : "-";

        vendorsToConnect.push({
          vendor: { connect: { id: v.id } },
          vendorPicName: v.picName || "Unknown PIC",
          vendorPicPhone: phone,
          roleInOrder: "Supplier",
        });
      }
    }

    // 4. TRANSACTION: Update Order
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // Hapus detail lama agar bersih dan diganti yang baru
      await tx.orderProduct.deleteMany({ where: { orderId: id } });
      await tx.orderVendor.deleteMany({ where: { orderId: id } });

      // Siapkan object untuk update relasi opsional
      // Prisma update syntax: { connect: { id: ... } } atau { disconnect: true }
      const updateRelations: any = {};

      if (clientB2BPICId) {
        updateRelations.pic = { connect: { id: clientB2BPICId } };
      } else {
        // Jika user mengosongkan PIC (misal ganti dari B2B ke B2C, atau hapus pilihan)
        // Kita disconnect agar field di DB jadi null
        updateRelations.pic = { disconnect: true };
      }

      if (purchaseChannelId) {
        updateRelations.purchaseChannel = {
          connect: { id: purchaseChannelId },
        };
      } else {
        updateRelations.purchaseChannel = { disconnect: true };
      }

      const order = await tx.order.update({
        where: { id },
        data: {
          dateOrder: new Date(orderCore.dateOrder),
          salesCategory: orderCore.salesCategory,
          poNumber: orderCore.poNumber,
          shippingAddress: orderCore.shippingAddress,
          totalAmount: totalAmount,

          client: { connect: { id: orderCore.clientId } },
          sales: { connect: { id: orderCore.salesId } },

          // Masukkan update PIC & Channel
          ...updateRelations,

          products: {
            create: orderProductsData,
          },
          vendors: {
            create: vendorsToConnect,
          },
        },
        include: {
          products: true,
          vendors: true,
          pic: true, // Return data PIC baru
          purchaseChannel: true, // Return data Channel baru
        },
      });

      return order;
    });

    return updatedOrder;
  }

  async getOrderForUpdate(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        products: true,
        vendors: true,
        // Tidak perlu include 'pic' atau 'purchaseChannel' full object
        // karena kita hanya butuh ID-nya yang sudah ada di table order.
      },
    });

    if (!order) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    const formValues = {
      dateOrder: order.dateOrder.toISOString().split("T")[0],
      salesCategory: order.salesCategory,
      poNumber: order.poNumber,

      clientId: order.clientId,
      salesId: order.salesId,
      shippingAddress: order.shippingAddress,

      // === TAMBAHAN BARU (Supaya muncul di form edit) ===
      // Pastikan field ini dikirim balik ke frontend
      clientB2BPICId: order.clientB2BPICId || "",
      purchaseChannelId: order.purchaseChannelId || "",

      // Vendor IDs (Array of string)
      vendorIds: order.vendors.map((v) => v.vendorId),

      // Products Mapping
      products: order.products.map((p) => {
        let customVal = "";
        if (
          p.customization &&
          typeof p.customization === "object" &&
          "detail" in p.customization
        ) {
          customVal = (p.customization as any).detail;
        } else if (typeof p.customization === "string") {
          try {
            const parsed = JSON.parse(p.customization);
            customVal = parsed.detail || "";
          } catch {}
        }

        return {
          productId: p.productId,
          variantId: p.variantId || "",
          quantity: p.quantity,
          price: Number(p.unitPrice),
          customization: customVal,
          remarks: p.remarks || "",
        };
      }),
    };

    return formValues;
  }

  // src/modules/order/order.service.ts (atau lokasi file service kamu)

  async getOrderForDetail(id: string) {
    // 1. Ambil Data Order
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        purchaseChannel: true,
        pic: true,
        client: {
          include: {
            b2b: { include: { department: true } },
            b2c: true,
          },
        },
        sales: true,
        products: {
          include: {
            product: true,
            variant: true,
          },
        },
        vendors: {
          include: {
            vendor: true,
          },
        },
        invoices: true,
      },
    });

    if (!order) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    // === [UPDATE PENTING DISINI] ===
    // 2. Ambil History Item yang SUDAH Masuk Invoice (Kecuali Cancelled)
    const billedItems = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          orderId: id, // Filter berdasarkan Order ID ini
          status: { not: "CANCELLED" }, // Abaikan invoice yang batal
        },
      },
    });

    // 3. Client Info Logic (Tetap Sama)
    let clientInfo = {
      name: "",
      phone: "",
      email: "",
      type: order.client.type,
      picName: "-",
      picPhone: "-",
    };

    if (order.client.b2b) {
      clientInfo.name = order.client.b2b.companyName;
      clientInfo.phone = order.client.b2b.phone || "-";
      clientInfo.email = order.client.b2b.email || "-";
      if (order.pic) {
        clientInfo.picName = order.pic.name;
        clientInfo.picPhone = order.pic.phone || "-";
      }
    } else if (order.client.b2c) {
      clientInfo.name = order.client.b2c.name;
      clientInfo.phone = order.client.b2c.phone || "-";
      clientInfo.picName = order.client.b2c.name;
    }

    // 4. Products Detail Mapping dengan Perhitungan SISA
    const productsDetail = order.products.map((p) => {
      // Logic Customization (Tetap Sama)
      let customizationDetail = "-";
      if (p.customization) {
        try {
          const cObj =
            typeof p.customization === "string"
              ? JSON.parse(p.customization)
              : p.customization;
          if (cObj && typeof cObj === "object" && "detail" in cObj) {
            customizationDetail = (cObj as any).detail;
          } else if (cObj) {
            customizationDetail = JSON.stringify(cObj);
          }
        } catch (e) {
          customizationDetail = String(p.customization);
        }
      }

      // === [CALCULATION LOGIC] ===
      // Hitung total qty yang sudah ditagih untuk produk spesifik ini
      // Kita harus mencocokkan productId DAN variantId agar akurat
      const currentBilledQty = billedItems
        .filter(
          (item) =>
            item.productId === p.productId && item.variantId === p.variantId,
        )
        .reduce((sum, item) => sum + item.quantity, 0);

      // Hitung Sisa (Total Order - Sudah Ditagih)
      // Math.max(0, ...) untuk mencegah nilai minus jika ada anomali data
      const remaining = Math.max(0, p.quantity - currentBilledQty);

      return {
        id: p.id,
        productId: p.productId, // ID Master Product (Penting untuk filter di frontend)
        variantId: p.variantId, // ID Varian
        productName: p.product?.name || "Unknown Product",
        sku: p.product?.sku || "-",
        variantName: p.variant ? p.variant.variantName || "-" : "-",
        quantity: p.quantity, // Total Qty Order Awal
        unitPrice: Number(p.unitPrice),
        totalPrice: Number(p.unitPrice) * p.quantity,
        customization: customizationDetail,
        remarks: p.remarks || "-",

        // [FIELD BARU UNTUK FRONTEND]
        billedQuantity: currentBilledQty, // Berapa yang sudah di-invoice
        remainingQuantity: remaining, // Berapa sisa yang boleh dipilih
      };
    });

    // 5. Vendors Detail Mapping (Tetap Sama)
    const vendorsDetail = order.vendors.map((v) => ({
      id: v.vendor.id,
      companyName: v.vendor.companyName,
      picName: v.vendorPicName,
      picPhone: v.vendorPicPhone,
      role: v.roleInOrder,
    }));

    // 6. Invoices Mapping (Tetap Sama)
    const invoicesDetail = order.invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmount: Number(inv.totalAmount),
      status: inv.status,
      category: inv.category,
      dueDate: inv.dueDate,
      createdAt: inv.createdAt,
      method: inv.method,
    }));

    // === RETURN OBJECT ===
    return {
      id: order.id,
      poNumber: order.poNumber,
      dateOrder: order.dateOrder,
      salesCategory: order.salesCategory,
      shippingAddress: order.shippingAddress,
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt,
      purchaseChannelName: order.purchaseChannel
        ? order.purchaseChannel.name
        : "-",
      clientInfo: clientInfo,
      sales: {
        name: order.sales.name,
        phone: order.sales.phone,
      },

      // Data Products yang sudah ada field 'remainingQuantity'
      products: productsDetail,

      vendors: vendorsDetail,
      invoices: invoicesDetail,
    };
  }

  async getAllOrders(query: {
    page?: number;
    take?: number;
    search?: string;
    salesCategory?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {};

    // 1. Filter Pencarian (PO, B2B Company, B2C Name)
    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { poNumber: { contains: searchTerm } },
        {
          client: {
            b2b: {
              is: { companyName: { contains: searchTerm } },
            },
          },
        },
        {
          client: {
            b2c: {
              is: { name: { contains: searchTerm } },
            },
          },
        },
      ];
    }

    // 2. Filter Kategori Sales
    if (query.salesCategory) {
      where.salesCategory = query.salesCategory;
    }

    // 3. Filter Tanggal
    if (query.startDate || query.endDate) {
      const dateFilter: any = {};

      if (query.startDate) {
        const start = new Date(query.startDate);
        if (!isNaN(start.getTime())) {
          dateFilter.gte = start;
        }
      }

      if (query.endDate) {
        const end = new Date(query.endDate);
        if (!isNaN(end.getTime())) {
          end.setDate(end.getDate() + 1); // +1 hari agar inklusif
          dateFilter.lt = end;
        }
      }

      // Hanya pasang filter jika ada isinya
      if (Object.keys(dateFilter).length > 0) {
        where.dateOrder = dateFilter;
      }
    }

    // === Pagination & Query Data ===
    const count = await this.prisma.order.count({ where });

    const orders = await this.prisma.order.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { dateOrder: "desc" },
      include: {
        client: {
          include: { b2b: true, b2c: true },
        },
        sales: { select: { name: true } },
        _count: {
          select: { products: true },
        },
      },
    });

    // Format data agar siap ditampilkan di tabel frontend
    const formattedData = orders.map((order) => {
      let clientName = "-";
      // Safe check dengan optional chaining
      if (order.client?.b2b) {
        clientName = order.client.b2b.companyName;
      } else if (order.client?.b2c) {
        clientName = order.client.b2c.name;
      }

      return {
        id: order.id,
        poNumber: order.poNumber,
        dateOrder: order.dateOrder,
        salesCategory: order.salesCategory,
        totalAmount: Number(order.totalAmount),
        clientName: clientName,
        salesName: order.sales?.name || "Unknown Sales",
        totalItems: order._count.products,
      };
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data: formattedData, meta };
  }
  async exportOrdersToExcel(query: OrderExportQuery): Promise<Buffer> {
    const { startDate, endDate, search, salesCategory } = query;

    const where: any = {};

    // 1. Filter Tanggal (Date Range)
    if (startDate || endDate) {
      where.dateOrder = {};
      if (startDate) {
        where.dateOrder.gte = new Date(startDate);
      }
      if (endDate) {
        // Tambahkan 1 hari agar endDate inklusif
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.dateOrder.lt = end;
      }
    }

    // 2. Filter Pencarian (PO Number atau Nama Client)
    if (search) {
      where.OR = [
        { poNumber: { contains: search } },
        { client: { b2b: { companyName: { contains: search } } } },
        { client: { b2c: { name: { contains: search } } } },
      ];
    }

    // 3. Filter Kategori Sales
    if (salesCategory) {
      where.salesCategory = salesCategory;
    }

    // 4. FETCH DATA DENGAN RELASI LENGKAP
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { dateOrder: "desc" },
      include: {
        client: {
          include: { b2b: true, b2c: true },
        },
        sales: {
          select: { name: true },
        },
        products: {
          include: {
            product: { select: { name: true, sku: true } },
            variant: { select: { variantName: true } },
          },
        },
        vendors: {
          include: {
            vendor: { select: { companyName: true } },
          },
        },
      },
    });

    // 5. SETUP WORKBOOK EXCEL
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Orders");

    // Definisi Kolom
    worksheet.columns = [
      { header: "PO Number", key: "poNumber", width: 20 },
      { header: "Tanggal Order", key: "dateOrder", width: 20 },
      { header: "Kategori", key: "salesCategory", width: 15 },
      { header: "Nama Client", key: "clientName", width: 30 },
      { header: "Tipe Client", key: "clientType", width: 15 },
      { header: "Sales Rep", key: "salesName", width: 20 },
      { header: "Total Amount (Rp)", key: "totalAmount", width: 25 },
      { header: "Detail Produk (Qty x Nama)", key: "products", width: 60 },
      { header: "Vendors", key: "vendors", width: 40 },
      { header: "Alamat Pengiriman", key: "address", width: 40 },
    ];

    // 6. POPULASI DATA BARIS
    orders.forEach((order) => {
      // Logic Client Name & Type
      let clientName = "-";
      let clientType = order.client.type;
      if (order.client.b2b) {
        clientName = order.client.b2b.companyName;
      } else if (order.client.b2c) {
        clientName = order.client.b2c.name;
      }

      // Logic Product Summary String (Multiline)
      // Format: "10x Kaos Polos - Merah (SKU123)"
      const productsString = order.products
        .map((p) => {
          const variantName = p.variant ? `(${p.variant.variantName})` : "";
          return `${p.quantity}x ${p.product.name} ${variantName} @${Number(p.unitPrice).toLocaleString("id-ID")}`;
        })
        .join("\n");

      // Logic Vendors Summary String
      const vendorsString = order.vendors
        .map((v) => `${v.vendor.companyName} (${v.roleInOrder})`)
        .join("\n");

      worksheet.addRow({
        poNumber: order.poNumber,
        dateOrder: order.dateOrder, // Akan diformat di bawah
        salesCategory: order.salesCategory,
        clientName: clientName,
        clientType: clientType,
        salesName: order.sales.name,
        totalAmount: Number(order.totalAmount),
        products: productsString,
        vendors: vendorsString,
        address: order.shippingAddress,
      });
    });

    // 7. STYLING

    // Header Style (Hijau Solid seperti contoh Product)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "00A86B" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Formatting Data Rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        // Format Tanggal (Kolom 2)
        const dateCell = row.getCell(2);
        dateCell.numFmt = "dd/mm/yyyy";
        dateCell.alignment = { vertical: "top", horizontal: "center" };

        // Format Currency (Kolom 7 - Total Amount)
        const amountCell = row.getCell(7);
        amountCell.numFmt = "#,##0";
        amountCell.alignment = { vertical: "top", horizontal: "right" };

        // Wrap Text & Top Align untuk kolom teks panjang (Produk, Vendor, Alamat)
        row.getCell(8).alignment = { vertical: "top", wrapText: true }; // Products
        row.getCell(9).alignment = { vertical: "top", wrapText: true }; // Vendors
        row.getCell(10).alignment = { vertical: "top", wrapText: true }; // Address

        // Default alignment untuk kolom lain
        row.getCell(1).alignment = { vertical: "top" }; // PO
        row.getCell(4).alignment = { vertical: "top" }; // Client
        row.getCell(6).alignment = { vertical: "top" }; // Sales
      }
    });

    // 8. GENERATE BUFFER
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
