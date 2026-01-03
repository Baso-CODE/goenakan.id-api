import { IsNotEmpty, IsString } from "class-validator";

export class CreateDepartmentDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;
}
