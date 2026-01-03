import { IsNotEmpty, IsString, IsOptional, IsIn } from "class-validator";

export class RegisterDTO {
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @IsNotEmpty()
  @IsString()
  readonly email!: string;

  @IsNotEmpty()
  @IsString()
  readonly password!: string;

  @IsOptional()
  @IsIn(["ADMIN_ARTICLE", "ADMIN_INVOICE"])
  readonly role?: string;
}
