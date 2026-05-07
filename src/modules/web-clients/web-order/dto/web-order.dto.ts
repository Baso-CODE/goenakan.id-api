import { WebOrderStatus } from "@prisma/client";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class CancelOrderDTO {
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: "Alasan pembatalan minimal 5 karakter" })
  reason!: string;
}

// src/modules/web-order/dto/web-order.dto.ts
export interface OrderQueryDTO {
  status?: WebOrderStatus;
  limit?: number;
  page?: number;
}

import { Type } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsNumber,
  IsOptional,
  ValidateNested,
} from "class-validator";

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
  price!: number;

  @IsOptional()
  customization?: any;
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
  subtotal!: number;

  @IsNumber()
  shippingCost!: number;

  @IsNumber()
  totalAmount!: number;
}
