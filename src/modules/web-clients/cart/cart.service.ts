import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { AddToCartDTO, SyncCartDTO, UpdateCartItemDTO } from "./dto/cart.dto";

@injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

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

  // === 1. GET CART ===
  async getCart(profileId: string) {
    const cart = await this.getOrCreateCart(profileId);

    return this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          orderBy: { createdAt: "desc" },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                basePrice: true,
                images: { take: 1, orderBy: { isFeatured: "desc" } },
                priceTiers: { orderBy: { minQuantity: "asc" } },

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
                images: { take: 1, orderBy: { isFeatured: "desc" } },

                weight: true,
                width: true,
                height: true,
                length: true,
              },
            },
          },
        },
      },
    });
  }

  // === 2. ADD TO CART ===
  async addToCart(profileId: string, data: AddToCartDTO) {
    const cart = await this.getOrCreateCart(profileId);

    // Cek apakah item (produk + varian yang sama) sudah ada di keranjang
    const existingItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: data.productId,
        variantId: data.variantId || null,
      },
    });

    if (existingItem) {
      // Jika sudah ada, tambahkan quantity-nya
      return this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + data.quantity,
          customization: data.customization || existingItem.customization,
          notes: data.notes || existingItem.notes,
        },
      });
    } else {
      // Jika belum ada, buat item baru
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

  // === 3. UPDATE CART ITEM (Ubah Quantity / Catatan) ===
  async updateCartItem(
    profileId: string,
    cartItemId: string,
    data: UpdateCartItemDTO,
  ) {
    const cart = await this.getOrCreateCart(profileId);

    // Pastikan item tersebut benar-benar milik user ini (keamanan)
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

  // === 5. CLEAR CART (Digunakan setelah berhasil Checkout) ===
  async clearCart(profileId: string) {
    const cart = await this.getOrCreateCart(profileId);

    return this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
  }

  // === 6. SYNC GUEST CART (Digunakan saat user login) ===
  async syncGuestCart(profileId: string, data: SyncCartDTO) {
    const syncPromises = data.items.map((item) =>
      this.addToCart(profileId, item),
    );
    await Promise.all(syncPromises);

    // Kembalikan isi keranjang terbaru setelah digabung
    return this.getCart(profileId);
  }
}
