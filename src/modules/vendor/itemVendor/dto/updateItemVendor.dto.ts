import {
  IsOptional,
  IsString,
  IsBoolean,
  IsUUID,
  IsNotEmpty,
} from "class-validator";

export class UpdateVendorItemDTO {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
