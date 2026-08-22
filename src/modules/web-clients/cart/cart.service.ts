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

  // === 1. GET CART (DENGAN KALKULASI HARGA TIER BERDASARKAN QUANTITY, KURS, & BILINGUAL) ===
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
                name_en: true,
                slug: true,
                basePrice: true,
                images: { take: 1, orderBy: { isFeatured: "desc" } },
                materialType: true,
                weight: true,
                width: true,
                height: true,
                length: true,
                priceTiers: { orderBy: { minQuantity: "desc" } }, // ✨ Ambil priceTiers produk
              },
            },
            variant: {
              select: {
                id: true,
                variantName: true,
                sku: true,
                price: true,
                priceTiers: { orderBy: { minQuantity: "desc" } }, // ✨ Ambil priceTiers varian
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

    // ✨ 2. KALKULASI HARGA BERDASARKAN TIER QUANTITY & FORMAT BILINGUAL ✨
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

        // B. Tentukan Harga Dasar & Active Tiers (Produk vs Varian)
        let calculatedPriceIdr = item.product.basePrice.toNumber();
        let activeTiers: any[] = item.product.priceTiers || [];

        if (item.variantId && item.variant) {
          if (item.variant.price) {
            calculatedPriceIdr = item.variant.price.toNumber();
          }

          if (item.variant.priceTiers && item.variant.priceTiers.length > 0) {
            activeTiers = item.variant.priceTiers;
          } else if (activeTiers.length > 0 && item.variant.price) {
            const diff =
              item.variant.price.toNumber() - item.product.basePrice.toNumber();
            activeTiers = activeTiers.map((t) => ({
              ...t,
              price: Number(t.price) + diff,
            }));
          }
        }

        // C. Cek Tier Berdasarkan Quantity User (Misal: 11 pcs masuk tier tertentu)
        const matchedTier = activeTiers.find(
          (tier) => item.quantity >= tier.minQuantity,
        );

        if (matchedTier) {
          calculatedPriceIdr = Number(matchedTier.price);
        }

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

        // D. Tambahkan Biaya Atribut (Bahan Premium, Ukuran XXL, dsb)
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
            calculatedPriceIdr += modifierIdr;

            resolvedAttributes.push({
              name: attr.attributeValue.value,
              modifier: parseFloat((modifierIdr * conversionRate).toFixed(2)),
            });
          });
        }

        // E. Tambahkan Biaya Sablon / Custom Logo (Opsional)
        const COST_PER_LOGO_IDR = 15000;
        if (customData.zones) {
          const zones = Object.values(customData.zones);
          zones.forEach((zone: any) => {
            const count = zone.logoCount || 1;
            calculatedPriceIdr += COST_PER_LOGO_IDR * count;
          });
        }

        customData.resolvedAttributes = resolvedAttributes;

        // F. KONVERSI HARGA TOTAL ITEM KE MATA UANG TARGET
        const finalConvertedPrice = parseFloat(
          (calculatedPriceIdr * conversionRate).toFixed(2),
        );

        const materialTypeName =
          (item.product as any).materialType?.name || undefined;

        return {
          ...item,
          product: {
            ...item.product,
            name: productName,
          },
          price: finalConvertedPrice,
          materialType: materialTypeName,
          customization: customData,
          selectedAttributes: item.selectedAttributes || null,
        };
      }),
    );

    return {
      ...rawCart,
      currencyCode: targetCurrency,
      items: processedItems,
    };
  }

  // === 2. ADD TO CART (MENYIMPAN SELECTED ATTRIBUTES) ===
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
          selectedAttributes:
            data.selectedAttributes || existingItem.selectedAttributes,
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
          selectedAttributes: data.selectedAttributes || null,
          notes: data.notes || null,
        },
      });
    }
  }

  // === 3. SYNC GUEST CART ===
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

  // === 4. HITUNG KERANJANG GUEST SECARA OFFLINE ===
  async calculateGuestCartOffline(
    items: any[],
    targetCurrency: string = "IDR",
    lang: string = "id",
  ) {
    let conversionRate = 1;

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

    const processedItems = await Promise.all(
      items.map(async (item) => {
        const dbProduct = await this.prisma.product.findUnique({
          where: { id: item.productId },
          include: {
            images: { take: 1 },
            materialType: true,
            priceTiers: { orderBy: { minQuantity: "desc" } },
          },
        });

        if (!dbProduct) return null;

        let productName = dbProduct.name;
        if (lang === "en") {
          productName = dbProduct.name_en || dbProduct.name;
        }

        let calculatedPriceIdr = dbProduct.basePrice.toNumber();
        let activeTiers: any[] = dbProduct.priceTiers || [];

        if (item.variantId) {
          const dbVariant = await this.prisma.productVariant.findUnique({
            where: { id: item.variantId },
            include: { priceTiers: { orderBy: { minQuantity: "desc" } } },
          });

          if (dbVariant?.price) {
            calculatedPriceIdr = dbVariant.price.toNumber();
          }

          if (dbVariant?.priceTiers && dbVariant.priceTiers.length > 0) {
            activeTiers = dbVariant.priceTiers;
          } else if (activeTiers.length > 0 && dbVariant?.price) {
            const diff =
              dbVariant.price.toNumber() - dbProduct.basePrice.toNumber();
            activeTiers = activeTiers.map((t) => ({
              ...t,
              price: Number(t.price) + diff,
            }));
          }
        }

        const matchedTier = activeTiers.find(
          (tier) => item.quantity >= tier.minQuantity,
        );

        if (matchedTier) {
          calculatedPriceIdr = Number(matchedTier.price);
        }

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

        const finalConvertedPrice = parseFloat(
          (calculatedPriceIdr * conversionRate).toFixed(2),
        );

        const dimParts = [
          dbProduct.length,
          dbProduct.width,
          dbProduct.height,
        ].filter((v) => v != null);

        const materialTypeName =
          (dbProduct as any).materialType?.name || undefined;

        return {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          name: productName,
          price: finalConvertedPrice,
          quantity: item.quantity,
          image:
            dbProduct.images?.[0]?.url || "/images/products/demo-products.png",
          materialType: materialTypeName,
          dimensions:
            dimParts.length > 0 ? `${dimParts.join(" x ")} cm` : undefined,
          weight: dbProduct.weight ? `${dbProduct.weight} gram` : undefined,
          customization: customData,
          selectedAttributes: item.selectedAttributes || null,
        };
      }),
    );

    return {
      currencyCode: targetCurrency,
      items: processedItems.filter((i) => i !== null),
    };
  }

  // === 5. UPDATE CART ITEM ===
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
        selectedAttributes:
          data.selectedAttributes !== undefined
            ? data.selectedAttributes
            : existingItem.selectedAttributes,
        notes: data.notes !== undefined ? data.notes : existingItem.notes,
      },
    });
  }

  // === 6. REMOVE FROM CART ===
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

  // === 7. CLEAR CART ===
  async clearCart(profileId: string) {
    const cart = await this.getOrCreateCart(profileId);

    return this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
  }
}
