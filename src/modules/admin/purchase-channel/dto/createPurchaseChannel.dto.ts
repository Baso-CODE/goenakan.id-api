import { IsNotEmpty, IsString, IsOptional, IsBoolean } from "class-validator";

export class CreatePurchaseChannelDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
