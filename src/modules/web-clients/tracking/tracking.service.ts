import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateWhatsappClickDTO } from "./dto/whatsapp-click.dto";

@injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  public async trackOrder(orderNumber: string, contactInfo: string) {
    console.log(`\n========================================`);
    console.log(`🔍 [TRACKING] Mencari Order Number: "${orderNumber}"`);
    console.log(`🔍 [TRACKING] Kontak yang diinput: "${contactInfo}"`);
    console.log(`========================================`);

    // 1. Ambil pesanan beserta relasi lengkap termasuk gambar dan varian produk
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        client: {
          include: { b2b: true, b2c: true },
        },
        webOrder: {
          include: {
            profile: true,
          },
        },
        products: {
          include: {
            product: {
              include: {
                images: { take: 1 }, //  Tarik gambar produk utama
              },
            },
            variant: {
              include: {
                images: { take: 1 }, //  Tarik gambar varian jika ada
                attributeValues: {
                  include: {
                    attributeValue: {
                      include: { attribute: true },
                    },
                  },
                },
              },
            },
          },
        },
        productionTrackers: {
          orderBy: { step: "asc" },
          select: {
            step: true,
            status: true,
            startDate: true,
            endDate: true,
            remarks: true,
          },
        },
        shipments: {
          orderBy: { createdAt: "desc" },
          include: {
            history: {
              orderBy: { date: "desc" },
            },
            items: {
              include: {
                orderProduct: {
                  include: { product: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      console.error(
        `❌ [TRACKING ERROR] Order "${orderNumber}" tidak ditemukan.`,
      );
      throw new ApiError(
        "Pesanan tidak ditemukan atau informasi kontak tidak cocok.",
        404,
      );
    }

    // 2. Validasi Keamanan (Pencocokan Kontak)
    let isValidContact = false;
    const searchContact = contactInfo.toLowerCase().trim();

    if (order.client?.b2b?.phone) {
      const dbPhone = order.client.b2b.phone.toLowerCase().trim();
      if (dbPhone.includes(searchContact)) isValidContact = true;
    }

    if (!isValidContact && order.client?.b2c?.phone) {
      const dbPhone = order.client.b2c.phone.toLowerCase().trim();
      if (dbPhone.includes(searchContact)) isValidContact = true;
    }

    if (!isValidContact && order.webOrder) {
      const guestEmail = order.webOrder.guestEmail?.toLowerCase().trim() || "";
      const guestPhone = order.webOrder.guestPhone?.toLowerCase().trim() || "";

      if (
        (guestEmail && guestEmail === searchContact) ||
        (guestPhone && guestPhone.includes(searchContact))
      ) {
        isValidContact = true;
      }

      if (!isValidContact && order.webOrder.profile) {
        const profilePhone =
          order.webOrder.profile.phone?.toLowerCase().trim() || "";
        const picPhone =
          order.webOrder.profile.picPhone?.toLowerCase().trim() || "";

        if (
          (profilePhone && profilePhone.includes(searchContact)) ||
          (picPhone && picPhone.includes(searchContact))
        ) {
          isValidContact = true;
        }
      }
    }

    if (!isValidContact && order.shippingAddress) {
      try {
        const addressObj =
          typeof order.shippingAddress === "string"
            ? JSON.parse(order.shippingAddress)
            : order.shippingAddress;

        const addressPhone = addressObj?.phone?.toLowerCase().trim() || "";
        if (addressPhone && addressPhone.includes(searchContact)) {
          isValidContact = true;
        }
      } catch (e) {
        // Abaikan
      }
    }

    if (!isValidContact) {
      console.error(
        `🚨 [TRACKING SECURITY] Validasi GAGAL untuk kontak "${searchContact}".`,
      );
      throw new ApiError(
        "Pesanan tidak ditemukan atau informasi kontak tidak cocok.",
        403,
      );
    }

    // =========================================================================
    //  PERBAIKAN: Format Alamat agar Menjadi Alamat Lengkap yang Utuh
    // =========================================================================
    let formattedAddress = order.shippingAddress;
    try {
      let parsed =
        typeof order.shippingAddress === "string"
          ? JSON.parse(order.shippingAddress)
          : order.shippingAddress;

      // Jika alamat tersimpan sebagai objek terstruktur dari form checkout
      if (parsed && typeof parsed === "object") {
        const parts = [
          parsed.fullAddress || parsed.address,
          parsed.district ? `Kec. ${parsed.district}` : null,
          parsed.city,
          parsed.province,
          parsed.postalCode,
        ].filter(Boolean); // Buang nilai yang kosong/null

        if (parts.length > 0) {
          formattedAddress = parts.join(", ");
        }
      }
    } catch (e) {
      // Jika gagal parsing, biarkan apa adanya
    }

    // 3. Kembalikan data terformat untuk Frontend
    return {
      orderNumber: order.orderNumber,
      dateOrder: order.dateOrder,
      status: order.status,
      totalAmount: order.totalAmount,
      shippingAddress: formattedAddress, // Menggunakan alamat yang sudah dirapikan

      // Ringkasan Produk dengan detail gambar, harga, dan varian
      items: order.products.map((item) => {
        // Ambil gambar dari varian jika ada, jika tidak ambil dari produk utama
        const imageObj = item.variant?.images?.[0] || item.product?.images?.[0];

        // Format atribut varian jika ada
        const variantAttributes =
          item.variant?.attributeValues?.map((av: any) => ({
            name: av.attributeValue?.attribute?.name,
            value: av.attributeValue?.value,
          })) || [];

        return {
          id: item.id,
          name: item.product.name,
          variantName: item.variant ? item.variant.variantName : null,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.unitPrice) * item.quantity,
          image:
            typeof imageObj === "string"
              ? imageObj
              : (imageObj as any)?.url || null,
          attributes: variantAttributes,
        };
      }),
      productionDetails: order.productionTrackers.map((tracker) => ({
        step: tracker.step,
        status: tracker.status,
        startDate: tracker.startDate,
        endDate: tracker.endDate,
        notes: tracker.remarks,
      })),
      shippingDetails: order.shipments.map((shipment) => ({
        trackingNumber: shipment.trackingNumber,
        courierLink: shipment.courierLink,
        status: shipment.status,
        method: shipment.method,
        origin: shipment.origin,
        destination: shipment.destination,
        departureDate: shipment.departureDate,
        arrivalDate: shipment.arrivalDate,
        shippedItems: shipment.items.map((shipItem) => ({
          name: shipItem.orderProduct.product.name,
          quantity: shipItem.quantity,
          carton: shipItem.totalCarton,
        })),
        timeline: shipment.history.map((historyEvent) => ({
          date: historyEvent.date,
          status: historyEvent.status,
          city: historyEvent.city,
          note: historyEvent.note,
        })),
      })),
    };
  }

  public async createWhatsappClick(
    data: CreateWhatsappClickDTO,
  ): Promise<void> {
    // 1. Ambil hanya field attribution yang disetujui.
    // Jangan simpan payload mentah langsung ke database.
    const allowedParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "gclid",
      "gbraid",
      "wbraid",
      "gad_source",
      "gad_campaignid",
      "fbclid",
      "ttclid",
    ] as const;

    const normalizeVisit = (visit: typeof data.attribution.first) => {
      if (!visit) return null;

      const params: Record<string, string> = {};

      for (const key of allowedParams) {
        const value = visit.params?.[key];

        if (typeof value === "string" && value.trim()) {
          params[key] = value.slice(0, 500);
        }
      }

      let referrer: string | null = null;

      if (visit.referrer) {
        try {
          const parsed = new URL(visit.referrer);

          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            referrer = parsed.origin;
          }
        } catch {
          throw new ApiError("Referrer tidak valid.", 400);
        }
      }

      return {
        landing_page: visit.landing_page,
        timestamp: visit.timestamp,
        params,
        referrer,
      };
    };

    const attribution = {
      first: normalizeVisit(data.attribution.first),
      last: normalizeVisit(data.attribution.last),

      ga_client_id: data.attribution.ga_client_id ?? null,
      ga_session_id: data.attribution.ga_session_id ?? null,
    };

    // 2. Pastikan tidak menerima query string pada page_path.
    if (
      !data.page_path.startsWith("/") ||
      data.page_path.startsWith("//") ||
      data.page_path.includes("?") ||
      data.page_path.includes("#")
    ) {
      throw new ApiError(
        "page_path harus berupa path tanpa query atau fragment.",
        400,
      );
    }

    // 3. Simpan kode unik.
    try {
      await this.prisma.whatsappClick.create({
        data: {
          code: data.code,
          pagePath: data.page_path,
          ctaName: data.cta_name,
          attribution: attribution as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(
          "Kode WhatsApp sudah digunakan. Silakan buat kode baru.",
          409,
        );
      }

      throw error;
    }
  }

  public async matchWhatsappClick(
    code: string,
    target:
      | { type: "lead"; id: number }
      | { type: "quotation"; id: string }
      | { type: "order"; id: string },
    adminId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Cari kode
      const click = await tx.whatsappClick.findUnique({
        where: { code },
      });

      if (!click) {
        throw new ApiError("Kode WhatsApp tidak ditemukan.", 404);
      }

      // 2. Pastikan target tersedia
      if (target.type === "lead") {
        const lead = await tx.contactMessage.findUnique({
          where: { id: target.id },
          select: { id: true },
        });

        if (!lead) {
          throw new ApiError("Lead tidak ditemukan.", 404);
        }
      }

      if (target.type === "quotation") {
        const quotation = await tx.quotation.findUnique({
          where: { id: target.id },
          select: { id: true },
        });

        if (!quotation) {
          throw new ApiError("Quotation tidak ditemukan.", 404);
        }
      }

      if (target.type === "order") {
        const order = await tx.order.findUnique({
          where: { id: target.id },
          select: { id: true },
        });

        if (!order) {
          throw new ApiError("Order tidak ditemukan.", 404);
        }
      }

      // 3. Cegah pencocokan ke target berbeda.
      // Gunakan updateMany bersyarat agar dua request
      // bersamaan tidak bisa mengambil kode yang sama.
      const updateData =
        target.type === "lead"
          ? { leadId: target.id }
          : target.type === "quotation"
            ? { quotationId: target.id }
            : { orderId: target.id };

      const result = await tx.whatsappClick.updateMany({
        where: {
          id: click.id,
          leadId: null,
          quotationId: null,
          orderId: null,
          matchedAt: null,
        },
        data: {
          ...updateData,
          matchedAt: new Date(),
          matchedById: adminId,
        },
      });

      if (result.count === 0) {
        throw new ApiError("Kode WhatsApp sudah pernah dicocokkan.", 409);
      }

      // 4. Ambil hasil
      return tx.whatsappClick.findUnique({
        where: { id: click.id },
        select: {
          id: true,
          code: true,
          pagePath: true,
          ctaName: true,
          leadId: true,
          quotationId: true,
          orderId: true,
          matchedAt: true,
          matchedById: true,
          createdAt: true,
        },
      });
    });
  }
}
