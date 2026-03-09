import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrderDTO } from "./dto/createOrder.dto";

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

      let finalPrice = item.price ? Number(item.price) : 0;

      if (finalPrice === 0) {
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
          finalPrice = Number(product.basePrice);
          if (product.priceTiers && product.priceTiers.length > 0) {
            const applicableTier = product.priceTiers.find(
              (t) => item.quantity >= t.minQuantity,
            );
            if (applicableTier) {
              finalPrice = Number(applicableTier.price);
            }
          }
        }
      }

      const subtotal = finalPrice * item.quantity;
      totalAmount += subtotal;

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

      orderProductsData.push(productData);
    }

    const vendorsToConnect: any[] = [];
    if (vendorIds && vendorIds.length > 0) {
      const vendors = await this.prisma.vendor.findMany({
        where: { id: { in: vendorIds } },
        include: { contacts: true },
      });

      for (const v of vendors) {
        const phone = v.contacts.length > 0 ? v.contacts[0].contactId : "-";

        vendorsToConnect.push({
          vendor: { connect: { id: v.id } },
          vendorPicName: v.picName || "Unknown PIC",
          vendorPicPhone: phone,
          roleInOrder: "Supplier",
        });
      }
    }

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
          totalAmount: totalAmount,

          client: { connect: { id: orderCore.clientId } },
          sales: { connect: { id: orderCore.salesId } },
          ...connectRelations,

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
          client: {
            include: {
              b2b: { include: { pics: true } },
            },
          },
          purchaseChannel: true,
        },
      });
      if (
        orderCore.salesCategory === "SAMPLE" &&
        data.sampleFollowUps &&
        data.sampleFollowUps.length > 0
      ) {
        await tx.orderSampleFollowUp.createMany({
          data: data.sampleFollowUps.map((fu) => ({
            orderId: order.id,
            name: fu.name,
            date: new Date(fu.date),
          })),
        });
      }
      return order;
    });

    return newOrder;
  }

  async updateOrder(id: string, data: CreateOrderDTO) {
    const {
      vendorIds,
      products,
      clientB2BPICId,
      purchaseChannelId,
      ...orderCore
    } = data;

    // 1. Cek apakah Order Exist
    const existingOrder = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

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
        finalPrice = Number(product.basePrice);
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

      orderProductsData.push(productData);
    }

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

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      await tx.orderProduct.deleteMany({ where: { orderId: id } });
      await tx.orderVendor.deleteMany({ where: { orderId: id } });

      const updateRelations: any = {};

      if (clientB2BPICId) {
        updateRelations.pic = { connect: { id: clientB2BPICId } };
      } else {
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
          pic: true,
          purchaseChannel: true,
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

      clientB2BPICId: order.clientB2BPICId || "",
      purchaseChannelId: order.purchaseChannelId || "",

      vendorIds: order.vendors.map((v) => v.vendorId),

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

  async getOrderForDetail(id: string) {
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
        sampleFollowUps: {
          orderBy: { date: "asc" },
        },
      },
    });

    if (!order) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    const activeInvoices = await this.prisma.invoice.findMany({
      where: {
        orderId: id,
        status: { not: "CANCELLED" },
      },
      include: {
        items: true,
      },
    });

    const activeInvoiceIds = activeInvoices.map((inv) => inv.id);
    const billedAmountByProduct = new Map<string, number>();
    for (const invoice of activeInvoices) {
      // Hitung total harga semua items di invoice ini
      const invoiceItemsTotal = invoice.items.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0,
      );

      for (const item of invoice.items) {
        const key = `${item.productId}_${item.variantId ?? "null"}`;
        const itemBaseAmount = Number(item.price) * item.quantity;

        // Proporsi item ini dari total invoice items
        const proportion =
          invoiceItemsTotal > 0 ? itemBaseAmount / invoiceItemsTotal : 0;

        // Nominal yang dibayar untuk item ini = proporsi × totalAmount invoice
        const paidForThisItem = Number(invoice.totalAmount) * proportion;

        billedAmountByProduct.set(
          key,
          (billedAmountByProduct.get(key) || 0) + paidForThisItem,
        );
      }
    }

    const billedItems =
      activeInvoiceIds.length > 0
        ? await this.prisma.invoiceItem.findMany({
            where: {
              invoiceId: { in: activeInvoiceIds },
            },
          })
        : [];

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
      const totalItemPrice = Number(p.unitPrice) * p.quantity;
      const currentBilledQty = billedItems
        .filter(
          (item) =>
            item.productId === p.productId && item.variantId === p.variantId,
        )
        .reduce((sum, item) => sum + item.quantity, 0);
      const remainingQty = Math.max(0, p.quantity - currentBilledQty);

      const key = `${p.productId}_${p.variantId ?? "null"}`;
      const currentBilledAmount = billedAmountByProduct.get(key) || 0;
      const remainingBilledAmount = Math.max(
        0,
        totalItemPrice - currentBilledAmount,
      );

      return {
        id: p.id,
        productId: p.productId,
        variantId: p.variantId,
        productName: p.product?.name || "Unknown Product",
        sku: p.product?.sku || "-",
        variantName: p.variant ? p.variant.variantName || "-" : "-",
        quantity: p.quantity, // Total Qty Order Awal
        unitPrice: Number(p.unitPrice),
        totalPrice: Number(p.unitPrice) * p.quantity,
        customization: customizationDetail,
        remarks: p.remarks || "-",

        billedQuantity: currentBilledQty,
        remainingQuantity: remainingQty,
        billedAmount: currentBilledAmount,
        remainingBilledAmount: remainingBilledAmount,
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
      sampleFollowUps: order.sampleFollowUps.map((fu) => ({
        id: fu.id,
        name: fu.name,
        date: fu.date,
        isDone: fu.isDone,
        createdAt: fu.createdAt,
      })),
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
      let clientName = "-";
      let clientType = order.client.type;
      if (order.client.b2b) {
        clientName = order.client.b2b.companyName;
      } else if (order.client.b2c) {
        clientName = order.client.b2c.name;
      }

      const productsString = order.products
        .map((p) => {
          const variantName = p.variant ? `(${p.variant.variantName})` : "";
          return `${p.quantity}x ${p.product.name} ${variantName} @${Number(p.unitPrice).toLocaleString("id-ID")}`;
        })
        .join("\n");

      const vendorsString = order.vendors
        .map((v) => `${v.vendor.companyName} (${v.roleInOrder})`)
        .join("\n");

      worksheet.addRow({
        poNumber: order.poNumber,
        dateOrder: order.dateOrder,
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
        const dateCell = row.getCell(2);
        dateCell.numFmt = "dd/mm/yyyy";
        dateCell.alignment = { vertical: "top", horizontal: "center" };

        const amountCell = row.getCell(7);
        amountCell.numFmt = "#,##0";
        amountCell.alignment = { vertical: "top", horizontal: "right" };

        // Wrap Text & Top Align untuk kolom teks panjang (Produk, Vendor, Alamat)
        row.getCell(8).alignment = { vertical: "top", wrapText: true };
        row.getCell(9).alignment = { vertical: "top", wrapText: true };
        row.getCell(10).alignment = { vertical: "top", wrapText: true };

        // Default alignment untuk kolom lain
        row.getCell(1).alignment = { vertical: "top" };
        row.getCell(4).alignment = { vertical: "top" };
        row.getCell(6).alignment = { vertical: "top" };
      }
    });

    // 8. GENERATE BUFFER
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  async getOrderForTracking(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            b2b: { select: { companyName: true } },
            b2c: { select: { name: true } },
          },
        },
        products: {
          include: {
            product: { select: { name: true, sku: true } },
            productionTrackers: {
              include: {
                vendor: { select: { companyName: true, trackingUrl: true } },
              },
              orderBy: { startDate: "desc" },
            },
          },
        },
        shipments: {
          include: {
            vendor: { select: { companyName: true, trackingUrl: true } },
            items: {
              include: {
                orderProduct: {
                  include: {
                    product: { select: { name: true } },
                  },
                },
              },
            },
            history: {
              orderBy: { date: "desc" },
            },
            notes: {
              include: {
                category: true,
              },
            },
          },
          orderBy: { departureDate: "desc" },
        },
      },
    });

    if (!order) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    // ✅ Helper kalkulasi hari
    const diffDays = (start: Date | null, end: Date | null): number => {
      if (!start || !end) return 0;
      return Math.ceil(
        (new Date(end).getTime() - new Date(start).getTime()) /
          (1000 * 60 * 60 * 24),
      );
    };

    // Mapping Data Products
    const productsFormatted = order.products.map((p) => {
      const producedQty = p.productionTrackers.reduce(
        (sum, t) => sum + (t.status === "COMPLETED" ? t.quantity : 0),
        0,
      );

      return {
        id: p.id,
        productId: p.productId,
        productName: p.product.name,
        sku: p.product.sku,
        quantity: p.quantity,
        productionTrackers: p.productionTrackers.map((t) => ({
          id: t.id,
          vendorId: t.vendorId,
          quantity: t.quantity,
          startDate: t.startDate,
          endDate: t.endDate,
          status: t.status,
          vendor: t.vendor,
        })),
        producedQuantity: producedQty,
        remainingProduction: Math.max(0, p.quantity - producedQty),
      };
    });

    // ✅ Kalkulasi Duration Summary
    const durationSummary = (() => {
      // --- PRODUCTION ---
      const allTrackers = order.products.flatMap((p) => p.productionTrackers);
      const prodStarts = allTrackers
        .map((t) => t.startDate)
        .filter(Boolean) as Date[];
      const prodEnds = allTrackers
        .map((t) => t.endDate)
        .filter(Boolean) as Date[];

      const prodStart = prodStarts.length
        ? new Date(Math.min(...prodStarts.map((d) => d.getTime())))
        : null;
      const prodEnd = prodEnds.length
        ? new Date(Math.max(...prodEnds.map((d) => d.getTime())))
        : null;
      const productionDays = diffDays(prodStart, prodEnd);

      // --- INBOUND ---
      const inboundShipments = order.shipments.filter(
        (s) => s.type === "INBOUND",
      );
      const inboundStart = inboundShipments.length
        ? new Date(
            Math.min(
              ...inboundShipments.map((s) =>
                new Date(s.departureDate || s.createdAt).getTime(),
              ),
            ),
          )
        : null;
      const inboundEnd =
        inboundShipments.length > 0 &&
        inboundShipments.every((s) => s.arrivalDate)
          ? new Date(
              Math.max(
                ...inboundShipments.map((s) =>
                  new Date(s.arrivalDate!).getTime(),
                ),
              ),
            )
          : null;
      const inboundDays = diffDays(inboundStart, inboundEnd);

      // --- OUTBOUND ---
      const outboundShipments = order.shipments.filter(
        (s) => s.type === "OUTBOUND",
      );
      const outboundStart = outboundShipments.length
        ? new Date(
            Math.min(
              ...outboundShipments.map((s) =>
                new Date(s.departureDate || s.createdAt).getTime(),
              ),
            ),
          )
        : null;
      const outboundEnd =
        outboundShipments.length > 0 &&
        outboundShipments.every((s) => s.arrivalDate)
          ? new Date(
              Math.max(
                ...outboundShipments.map((s) =>
                  new Date(s.arrivalDate!).getTime(),
                ),
              ),
            )
          : null;
      const outboundDays = diffDays(outboundStart, outboundEnd);

      // --- TOTAL ---
      const totalStart = prodStart || inboundStart || outboundStart;
      const totalEnd = outboundEnd || inboundEnd || prodEnd || new Date();
      const totalDays = diffDays(totalStart, totalEnd);

      return {
        production: {
          days: productionDays,
          startDate: prodStart,
          endDate: prodEnd,
          isComplete:
            allTrackers.length > 0 && allTrackers.every((t) => t.endDate),
        },
        inbound: {
          days: inboundDays,
          startDate: inboundStart,
          endDate: inboundEnd,
          isComplete: inboundShipments.length > 0 && inboundEnd !== null,
        },
        outbound: {
          days: outboundDays,
          startDate: outboundStart,
          endDate: outboundEnd,
          isComplete: outboundShipments.length > 0 && outboundEnd !== null,
        },
        total: {
          days: totalDays,
          startDate: totalStart,
          endDate: outboundEnd,
          isComplete: outboundEnd !== null,
        },
      };
    })();

    return {
      id: order.id,
      poNumber: order.poNumber,
      client: order.client,
      products: productsFormatted,
      shipments: order.shipments,
      durationSummary,
    };
  }

  async getSampleStats() {
    const aggregate = await this.prisma.order.aggregate({
      where: {
        salesCategory: "SAMPLE",
      },
      _count: {
        id: true,
      },
      _sum: {
        totalAmount: true,
      },
    });

    const totalCount = aggregate._count.id;
    const totalCost = Number(aggregate._sum.totalAmount) || 0;

    const sampleClients = await this.prisma.order.findMany({
      where: { salesCategory: "SAMPLE" },
      select: { clientId: true },
      distinct: ["clientId"],
    });

    const sampleClientIds = sampleClients.map((o) => o.clientId);
    const totalUniqueSampleClients = sampleClientIds.length;

    let convertedClientsCount = 0;

    if (totalUniqueSampleClients > 0) {
      const convertedClients = await this.prisma.order.groupBy({
        by: ["clientId"],
        where: {
          clientId: { in: sampleClientIds },
          salesCategory: "SALES",
        },
      });

      convertedClientsCount = convertedClients.length;
    }

    const conversionRate =
      totalUniqueSampleClients > 0
        ? (convertedClientsCount / totalUniqueSampleClients) * 100
        : 0;

    return {
      totalCount,
      totalCost,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
    };
  }

  async generatePoNumberAPI(): Promise<string> {
    const totalOrders = await this.prisma.order.count();

    const sequence = String(totalOrders + 1).padStart(4, "0");

    return `GI-PO${sequence}`;
  }

  // ===============================================
  // ANALYTICS & CHART DATA
  // ===============================================
  async getSalesAnalytics(year?: number) {
    const currentYear = year || new Date().getFullYear();

    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Ags",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];

    const orders = await this.prisma.order.findMany({
      where: {
        dateOrder: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
      select: {
        dateOrder: true,
        totalAmount: true,

        cashflowSummary: {
          select: {
            profitLoss: true,
          },
        },
      },
    });

    const chartData = months.map((month) => ({
      name: month,
      orders: 0,
      profit: 0,
      revenue: 0,
    }));

    orders.forEach((order) => {
      const monthIndex = new Date(order.dateOrder).getMonth();

      chartData[monthIndex].orders += 1;

      if (order.cashflowSummary && order.cashflowSummary.length > 0) {
        chartData[monthIndex].profit += Number(
          order.cashflowSummary[0].profitLoss,
        );
      } else {
        const revenue = Number(order.totalAmount);
        chartData[monthIndex].revenue += revenue;

        chartData[monthIndex].profit += revenue * 0.2;
      }
    });

    return chartData;
  }

  // ===============================================
  // METRICS / DASHBOARD SUMMARY
  // ===============================================
  async getSalesMetrics() {
    const now = new Date();

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    );

    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // --- HELPER FUNCTION UNTUK QUERY AGREGAT ---
    const getMetricsByDateRange = async (start: Date, end: Date) => {
      const orderAgg = await this.prisma.order.aggregate({
        where: {
          dateOrder: { gte: start, lte: end },
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      const expenseAgg = await this.prisma.financeTransaction.aggregate({
        where: {
          transactionDate: { gte: start, lte: end },
          type: "EXPENSE",
        },
        _sum: { amount: true },
      });

      const otherIncomeAgg = await this.prisma.financeTransaction.aggregate({
        where: {
          transactionDate: { gte: start, lte: end },
          type: "INCOME",
        },
        _sum: { amount: true },
      });

      const revenueFromOrders = Number(orderAgg._sum.totalAmount) || 0;
      const revenueFromFinance = Number(otherIncomeAgg._sum.amount) || 0;
      const totalSpending = Number(expenseAgg._sum.amount) || 0;

      const totalRevenue = revenueFromOrders + revenueFromFinance;
      const totalOrders = orderAgg._count.id;

      const totalProfit = totalRevenue - totalSpending;

      return { totalRevenue, totalProfit, totalOrders, totalSpending };
    };

    // 2. Eksekusi Query secara Paralel
    const [current, last] = await Promise.all([
      getMetricsByDateRange(startOfCurrentMonth, endOfCurrentMonth),
      getMetricsByDateRange(startOfLastMonth, endOfLastMonth),
    ]);

    // 3. Hitung Persentase Perubahan
    const calculatePercentage = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      totalRevenue: current.totalRevenue,
      revenueChange: calculatePercentage(
        current.totalRevenue,
        last.totalRevenue,
      ),

      totalProfit: current.totalProfit,
      profitChange: calculatePercentage(current.totalProfit, last.totalProfit),

      totalOrders: current.totalOrders,
      ordersChange: current.totalOrders - last.totalOrders, // Selisih jumlah (bukan %)

      totalSpending: current.totalSpending,
      spendingChange: calculatePercentage(
        current.totalSpending,
        last.totalSpending,
      ),
    };
  }
}
