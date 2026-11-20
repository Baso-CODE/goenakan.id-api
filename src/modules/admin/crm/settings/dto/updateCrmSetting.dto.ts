import { CrmAssignMethod } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";

export class UpdateCrmSettingDTO {
  @IsOptional()
  @IsString()
  leadReceiverSessionId?: string;

  @IsOptional()
  @IsString()
  leadReceiverPhone?: string;

  @IsOptional()
  @IsBoolean()
  ignoreGroups?: boolean;

  @IsOptional()
  @IsBoolean()
  ignoreBroadcasts?: boolean;

  @IsOptional()
  @IsEnum(CrmAssignMethod)
  defaultAssignMethod?: CrmAssignMethod;

  @IsOptional()
  @IsInt()
  slaThresholdMinutes?: number;

  @IsOptional()
  @IsString()
  blacklistedNumbers?: string;
}
