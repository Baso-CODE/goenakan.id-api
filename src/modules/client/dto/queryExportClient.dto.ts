import { IsBooleanString, IsEnum, IsOptional, IsString } from "class-validator";
import { ClientType } from "./createClient.dto";

export class ClientListQueryDTO {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  @IsEnum(ClientType, { message: "Type must be B2B or B2C" })
  type?: ClientType | "ALL";

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;
}
