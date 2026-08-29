import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";

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
}
