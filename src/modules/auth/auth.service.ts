import { Role } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { prismaExclude } from "../prisma/utils";
import { RegisterDTO } from "./dto/register.dto";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

@injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  // === LOGIN ===
  // login = async (body: LoginDTO) => {
  //   const { email, password } = body;

  //   const existingUser = await this.prisma.user.findFirst({
  //     where: { email },
  //   });

  //   if (!existingUser) {
  //     throw new ApiError("User not found", 404);
  //   }

  //   const isPasswordValid = await this.passwordService.comparePassword(
  //     password,
  //     existingUser.password,
  //   );

  //   if (!isPasswordValid) {
  //     throw new ApiError("Invalid credentials", 400);
  //   }

  //   const accessToken = this.tokenService.generateToken(
  //     {
  //       id: existingUser.id,
  //       role: existingUser.role,
  //     },
  //     env().JWT_SECRET,
  //   );

  //   const { password: pw, ...userWithoutPassword } = existingUser;
  //   return { ...userWithoutPassword, accessToken };
  // };

  // === REGISTER ===
  register = async (body: RegisterDTO) => {
    const { email, password, name, role } = body;

    // 1. Cek apakah email sudah dipakai
    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      throw new ApiError("Email already exist", 400);
    }

    // 2. Cegah pendaftaran SUPER_ADMIN lewat endpoint
    if (role === "SUPER_ADMIN") {
      throw new ApiError(
        "SUPER_ADMIN cannot be registered via this endpoint",
        403,
      );
    }

    // 3. Hash password
    const hashedPassword = await this.passwordService.hashPassword(password);

    // 4. Simpan user baru
    const newUser = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: (role as Role) || Role.ADMIN_INVOICE,
      },
      select: prismaExclude("User", ["password"]),
    });

    return newUser;
  };
}
