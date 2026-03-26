export class UpdateProductVariantsDTO {
  productId!: string;
  variants!: {
    variantId?: string;
    sku: string;
    variantName?: string;
    price?: number;
    stock: number;
    weight?: number;
    width?: number;
    height?: number;
    length?: number;
    attributeValueIds: string[];
    _isDeleted?: boolean;
    images: {
      id?: string; // undefined = create (new image)
      url: string;
      publicId: string;
      isFeatured?: boolean;
      altText?: string;
      markedForDelete?: boolean;
      _isDeleted?: boolean;

      fileIndex?: number; // <── TAMBAHKAN INI
    }[];
  }[];
}

export interface UpdateProductVariantFiles {
  variantImages?: Express.Multer.File[];
}
