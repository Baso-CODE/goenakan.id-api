import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewProductUrlRequestDTO {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNote?: string;
}
