export class UpdateProductAttributesDTO {
  productId!: string;

  attributeValueIds!: string[];

  priceModifiers?: Record<string, number>;
  weights?: Record<string, number>;
  widths?: Record<string, number>;
  heights?: Record<string, number>;
  lengths?: Record<string, number>;

  orderedAttributeIds?: string[];

  orderedAttributeValueIds?: string[];
}
