import { plainToInstance } from "class-transformer";
import { IsNotEmpty, IsNumber, IsString, validateSync } from "class-validator";
import { config as dotenvConfig } from "dotenv";
dotenvConfig();

class EnvConfig {
  @IsNotEmpty()
  @IsNumber()
  readonly PORT!: number;

  @IsNotEmpty()
  @IsString()
  readonly DATABASE_URL!: string;

  @IsNotEmpty()
  @IsString()
  readonly JWT_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  readonly NEXTAUTH_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  readonly MAIL_USER!: string;

  @IsNotEmpty()
  @IsString()
  readonly MAIL_PASSWORD!: string;

  @IsNotEmpty()
  @IsString()
  readonly CLOUDINARY_CLOUD_NAME!: string;

  @IsNotEmpty()
  @IsString()
  readonly CLOUDINARY_API_KEY!: string;

  @IsNotEmpty()
  @IsString()
  readonly CLOUDINARY_API_SECRET!: string;

  @IsNotEmpty() // Tambahkan ini agar wajib diisi di .env
  @IsString()
  readonly CORS_ORIGIN!: string;
}

export const env = () => {
  const envConfig = plainToInstance(EnvConfig, process.env, {
    enableImplicitConversion: true, // Automatically convert types (e.g., string to number)
  });

  const errors = validateSync(envConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation error: ${errors
        .map((err) => Object.values(err.constraints || {}).join(", "))
        .join("; ")}`,
    );
  }

  return envConfig;
};
