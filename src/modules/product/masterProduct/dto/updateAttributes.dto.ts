export class UpdateProductAttributesDTO {
  productId!: string;

  attributeValueIds!: string[];

  priceModifiers?: Record<string, number>;
}
