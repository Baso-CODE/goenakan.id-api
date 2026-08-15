import { injectable } from "tsyringe";
import { CurrencyConversionService } from "../../admin/currency/convertionCurrency.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AddToCartDTO, SyncCartDTO, UpdateCartItemDTO } from "./dto/cart.dto";

@injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyConversion: CurrencyConversionService,
  ) {}

  // === HELPER: GET ATAU BUAT KERANJANG ===
  private async getOrCreateCart(profileId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { profileId },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { profileId },
      });
    }

    return cart;
  }

  // === 1. GET CART (DENGAN KALKULASI HARGA DINAMIS, KURS, & BAHASA BILINGUAL) ===
  async getCart(
    profileId: string,
    targetCurrency: string = "IDR",
    lang: string = "id",
  ) {
    const cart = await this.getOrCreateCart(profileId);

    const rawCart = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          orderBy: { createdAt: "desc" },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                name_en: true, // ✨ Ambil nama bahasa Inggris untuk bilingual
                slug: true,
                basePrice: true,
                images: { take: 1, orderBy: { isFeatured: "desc" } },
                materialType: true,
                weight: true,
                width: true,
                height: true,
                length: true,
              },
            },
            variant: {
              select: {
                id: true,
                variantName: true,
                sku: true,
                price: true,
              },
            },
          },
        },
      },
    });

    if (!rawCart) return null;

    // ✨ 1. AMBIL NILAI KURS JIKA BUKAN IDR ✨
    let conversionRate = 1;
    if (targetCurrency && targetCurrency !== "IDR") {
      try {
        const conversionResult = await this.currencyConversion.convertCurrency({
          fromCurrency: "IDR",
          toCurrency: targetCurrency,
          amount: 1,
        });
        conversionRate = conversionResult.rate;
      } catch (error) {
        console.error(
          "Gagal mengambil nilai tukar untuk keranjang, fallback ke IDR",
          error,
        );
      }
    }

    // ✨ 2. KALKULASI HARGA DINAMIS & FORMAT BILINGUAL UNTUK SETIAP ITEM ✨
    const processedItems = await Promise.all(
      rawCart.items.map(async (item) => {
        // A. Pemilihan Nama Produk Berdasarkan Bahasa (Bilingual Support)
        let productName = item.product.name;
        if (lang === "en") {
          productName =
            item.product.name_en || item.product.name || "Unnamed Product";
        } else {
          productName =
            item.product.name || item.product.name_en || "Produk Tanpa Nama";
        }

        // B. Ambil Harga Dasar (MURNI IDR)
        let calculatedPriceIdr = item.variant?.price
          ? item.variant.price.toNumber()
          : item.product.basePrice.toNumber();

        let customData: any = {};
        let resolvedAttributes: any[] = [];

        try {
          if (item.customization) {
            customData =
              typeof item.customization === "string"
                ? JSON.parse(item.customization)
                : item.customization;
          }
        } catch (e) {
          console.error("Gagal mem-parsing customization keranjang", e);
        }

        // C. Tambahkan Biaya Atribut (Bahan Premium, Ukuran XXL, dsb)
        if (
          customData.selectedAttributeValueIds &&
          Array.isArray(customData.selectedAttributeValueIds)
        ) {
          const attributes = await this.prisma.productAttributeValue.findMany({
            where: {
              productId: item.productId,
              attributeValueId: { in: customData.selectedAttributeValueIds },
            },
            include: { attributeValue: true },
          });

          attributes.forEach((attr) => {
            const modifierIdr = attr.priceModifier
              ? Number(attr.priceModifier)
              : 0;
            calculatedPriceIdr += modifierIdr; // Tambahkan ke total IDR

            resolvedAttributes.push({
              name: attr.attributeValue.value,
              modifier: parseFloat((modifierIdr * conversionRate).toFixed(2)),
            });
          });
        }

        // D. Tambahkan Biaya Sablon / Custom Logo (Opsional)
        const COST_PER_LOGO_IDR = 15000;
        if (customData.zones) {
          const zones = Object.values(customData.zones);
          zones.forEach((zone: any) => {
            const count = zone.logoCount || 1;
            calculatedPriceIdr += COST_PER_LOGO_IDR * count;
          });
        }

        customData.resolvedAttributes = resolvedAttributes;

        // E. KONVERSI HARGA TOTAL ITEM KE MATA UANG TARGET
        const finalConvertedPrice = parseFloat(
          (calculatedPriceIdr * conversionRate).toFixed(2),
        );

        return {
          ...item,
          product: {
            ...item.product,
            name: productName, // Mengganti nama produk sesuai bahasa
          },
          price: finalConvertedPrice,
          customization: customData,
        };
      }),
    );

    return {
      ...rawCart,
      currencyCode: targetCurrency,
      items: processedItems,
    };
  }

  // === 2. ADD TO CART ===
  async addToCart(profileId: string, data: AddToCartDTO) {
    const cart = await this.getOrCreateCart(profileId);

    const existingItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: data.productId,
        variantId: data.variantId || null,
      },
    });

    if (existingItem) {
      return this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + data.quantity,
          customization: data.customization || existingItem.customization,
          notes: data.notes || existingItem.notes,
        },
      });
    } else {
      return this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: data.productId,
          variantId: data.variantId || null,
          quantity: data.quantity,
          customization: data.customization || null,
          notes: data.notes || null,
        },
      });
    }
  }

  // === 3. UPDATE CART ITEM ===
  async updateCartItem(
    profileId: string,
    cartItemId: string,
    data: UpdateCartItemDTO,
  ) {
    const cart = await this.getOrCreateCart(profileId);

    const existingItem = await this.prisma.cartItem.findFirst({
      where: { id: cartItemId, cartId: cart.id },
    });

    if (!existingItem) {
      throw new Error("Cart item not found or unauthorized");
    }

    return this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: {
        quantity:
          data.quantity !== undefined ? data.quantity : existingItem.quantity,
        customization:
          data.customization !== undefined
            ? data.customization
            : existingItem.customization,
        notes: data.notes !== undefined ? data.notes : existingItem.notes,
      },
    });
  }

  // === 4. REMOVE FROM CART ===
  async removeCartItem(profileId: string, cartItemId: string) {
    const cart = await this.getOrCreateCart(profileId);

    const existingItem = await this.prisma.cartItem.findFirst({
      where: { id: cartItemId, cartId: cart.id },
    });

    if (!existingItem) {
      throw new Error("Cart item not found or unauthorized");
    }

    return this.prisma.cartItem.delete({
      where: { id: cartItemId },
    });
  }

  // === 5. CLEAR CART ===
  async clearCart(profileId: string) {
    const cart = await this.getOrCreateCart(profileId);

    return this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
  }

  // === 6. SYNC GUEST CART ===
  async syncGuestCart(
    profileId: string,
    data: SyncCartDTO,
    targetCurrency: string = "IDR",
    lang: string = "id",
  ) {
    const syncPromises = data.items.map((item) =>
      this.addToCart(profileId, item),
    );
    await Promise.all(syncPromises);

    return this.getCart(profileId, targetCurrency, lang);
  }

  // === 7. HITUNG KERANJANG GUEST SECARA OFFLINE (Backend Source of Truth) ===
  async calculateGuestCartOffline(
    items: any[],
    targetCurrency: string = "IDR",
    lang: string = "id",
  ) {
    let conversionRate = 1;

    // 1. Ambil Rate Mata Uang
    if (targetCurrency !== "IDR") {
      try {
        const conversionResult = await this.currencyConversion.convertCurrency({
          fromCurrency: "IDR",
          toCurrency: targetCurrency,
          amount: 1,
        });
        conversionRate = conversionResult.rate;
      } catch (error) {
        console.error(
          "Gagal mengambil nilai tukar untuk guest, fallback ke IDR",
          error,
        );
      }
    }

    // 2. Hitung Ulang Data Murni dari Database
    const processedItems = await Promise.all(
      items.map(async (item) => {
        // Ambil produk dari DB agar harga (basePrice) 100% akurat dari backend
        const dbProduct = await this.prisma.product.findUnique({
          where: { id: item.productId },
          include: { images: { take: 1 }, materialType: true },
        });

        if (!dbProduct) return null;

        // ✨ PERBAIKAN UTAMA DI SINI: Gunakan dbProduct.name (bukan name_id)
        let productName = dbProduct.name;
        if (lang === "en") {
          productName = dbProduct.name_en || dbProduct.name;
        }

        // Tentukan Harga Awal (IDR)
        let calculatedPriceIdr = dbProduct.basePrice.toNumber();
        if (item.variantId) {
          const dbVariant = await this.prisma.productVariant.findUnique({
            where: { id: item.variantId },
          });
          if (dbVariant?.price) calculatedPriceIdr = dbVariant.price.toNumber();
        }

        // Kalkulasi Tambahan Kustomisasi Sablon
        let customData: any = item.customization || {};
        try {
          if (typeof customData === "string")
            customData = JSON.parse(customData);
        } catch (e) {}

        const COST_PER_LOGO_IDR = 15000;
        if (customData.zones) {
          Object.values(customData.zones).forEach((zone: any) => {
            calculatedPriceIdr += COST_PER_LOGO_IDR * (zone.logoCount || 1);
          });
        }

        // Konversi ke Target Mata Уang (Misal: Dolar)
        const finalConvertedPrice = parseFloat(
          (calculatedPriceIdr * conversionRate).toFixed(2),
        );

        // Format data yang dikirim balik ke frontend
        const dimParts = [
          dbProduct.length,
          dbProduct.width,
          dbProduct.height,
        ].filter((v) => v != null);
        return {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          name: productName,
          price: finalConvertedPrice,
          quantity: item.quantity,
          image:
            dbProduct.images?.[0]?.url || "/images/products/demo-products.png",
          materialType: dbProduct.materialType?.name,
          dimensions:
            dimParts.length > 0 ? `${dimParts.join(" x ")} cm` : undefined,
          weight: dbProduct.weight ? `${dbProduct.weight} gram` : undefined,
          customization: customData,
        };
      }),
    );

    // Kembalikan ke Frontend (Mata Uang & Item yang Dikonversi)
    return {
      currencyCode: targetCurrency,
      items: processedItems.filter((i) => i !== null),
    };
  }
}
