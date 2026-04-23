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
