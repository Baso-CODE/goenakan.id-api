export class UpdateProductVariantsDTO {
  productId!: string;
  variants!: {
    variantId?: string;
    sku: string;
    variantName?: string;
    description?: string;
    price?: number;
    stock: number;
    weight?: number;
    width?: number;
    height?: number;
    length?: number;
    attributeValueIds: string[];
    _isDeleted?: boolean;
    priceTiers?: {
      minQuantity: number;
      maxQuantity?: number | null;
      price: string | number;
    }[];
    images: {
      id?: string;
      url: string;
      publicId: string;
      isFeatured?: boolean;
      altText?: string;
      markedForDelete?: boolean;
      _isDeleted?: boolean;

      fileIndex?: number;
    }[];
  }[];
}

export interface UpdateProductVariantFiles {
  variantImages?: Express.Multer.File[];
}
