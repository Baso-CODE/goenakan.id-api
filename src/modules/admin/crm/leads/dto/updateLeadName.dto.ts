import { IsNotEmpty, IsString } from "class-validator";

export class UpdateLeadNameDTO {
  @IsString()
  @IsNotEmpty()
  displayName!: string;
}
