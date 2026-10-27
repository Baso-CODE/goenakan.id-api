import { WebOrderStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CancelOrderDTO {
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: "Alasan pembatalan minimal 5 karakter" })
  reason!: string;
}

export interface OrderQueryDTO {
  status?: WebOrderStatus;
  limit?: number;
  page?: number;
}

class AddressDTO {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  province?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  subDistrict?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsNotEmpty()
  address!: string;
}

class OrderItemDTO {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  @IsOptional()
  price?: number; // Opsional karena harga divalidasi dan diambil langsung dari database demi keamanan

  @IsOptional()
  customization?: any;

  //  TAMBAHAN BARU: Menerima atribut pilihan (seperti warna, bahan) dari frontend
  @IsOptional()
  selectedAttributes?: any;
}

export class CreateWebOrderDTO {
  @ValidateNested()
  @Type(() => AddressDTO)
  form!: AddressDTO;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDTO)
  items!: OrderItemDTO[];

  @IsString()
  @IsOptional()
  note?: string; // Catatan dari customer

  @IsNumber()
  @IsOptional()
  shippingCost?: number; // Biaya pengiriman dari client

  @IsOptional()
  attribution?: unknown;
}
