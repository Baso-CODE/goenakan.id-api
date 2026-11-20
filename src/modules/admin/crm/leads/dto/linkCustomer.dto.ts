import { IsNotEmpty, IsString } from "class-validator";

export class LinkCustomerDTO {
  @IsString()
  @IsNotEmpty()
  customerProfileId!: string;
}
