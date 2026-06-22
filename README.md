# 🍽️ Goenakan.id API

Backend RESTful API untuk platform **Goenakan.id** — dibangun dengan **Express**, **Prisma**, **TypeScript**, dan **Dependency Injection (tsyringe)**. API ini mendukung autentikasi, manajemen pengguna, pembayaran via Midtrans, upload file ke Cloudinary, pengiriman email, serta berbagai fitur CRUD.

---

## 📋 Daftar Isi

- [Tech Stack](#-tech-stack)
- [Struktur Proyek](#-struktur-proyek)
- [Arsitektur Sistem](#-arsitektur-sistem)
- [Prasyarat](#-prasyarat)
- [Instalasi](#-instalasi)
- [Environment Variables](#-environment-variables)
- [Menjalankan Aplikasi](#-menjalankan-aplikasi)
- [Docker](#-docker)
- [Testing](#-testing)
- [Scripts](#-scripts)
- [Conventional Commits](#-conventional-commits)

---

## 🛠️ Tech Stack

| Kategori | Teknologi |
|---|---|
| Runtime | [Bun](https://bun.sh) / Node.js |
| Framework | [Express.js](https://expressjs.com) |
| ORM | [Prisma](https://www.prisma.io) |
| Database | MySQL / MariaDB |
| Bahasa | TypeScript |
| Autentikasi | JWT, Lucia Auth, Better Auth, Argon2 |
| DI Container | [tsyringe](https://github.com/microsoft/tsyringe) |
| Email | Nodemailer + Handlebars |
| Upload File | Multer + Cloudinary |
| Pembayaran | Midtrans |
| Validasi | class-validator + class-transformer |
| Penjadwalan | node-cron |
| Kontainerisasi | Docker |
| Testing | Jest + Supertest |
| Linting/Format | Prettier, Husky, lint-staged |
| Commit | Commitlint (Conventional Commits) |

---

## 📁 Struktur Proyek

```
goenakan.id-api/
├── .github/
│   └── workflows/          # CI/CD GitHub Actions
├── prisma/
│   ├── schema.prisma       # Skema database
│   └── seed.ts             # Data seeder
├── scripts/                # Script utilitas
├── src/
│   ├── modules/            # Modul fitur (auth, user, dll.)
│   │   └── mail/
│   │       └── templates/  # Template email (Handlebars)
│   └── index.ts            # Entry point aplikasi
├── .env.example            # Contoh konfigurasi environment
├── .env.test               # Konfigurasi environment untuk testing
├── Dockerfile              # Docker image definition
├── docker-compose.yml      # Docker Compose untuk development/testing
├── prisma.config.ts        # Konfigurasi Prisma
├── tsconfig.json           # Konfigurasi TypeScript
└── package.json
```

---

## 🏗️ Arsitektur Sistem

Proyek ini menggunakan **Layered Architecture** berbasis modul, dikombinasikan dengan **Dependency Injection** via `tsyringe`. Setiap fitur dikemas dalam modul tersendiri yang berisi Router, Controller, Service, dan DTO-nya masing-masing.

### Alur Request

```
HTTP Request
     │
     ▼
┌─────────────────────────────────┐
│          src/index.ts           │  ← Entry point, inisialisasi Express App,
│        (App Bootstrap)          │    middleware global, dan mount semua router
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│     src/modules/**/router.ts    │  ← Mendefinisikan endpoint & method HTTP,
│          (Router Layer)         │    memasang middleware (auth, upload, dll.),
└────────────────┬────────────────┘    lalu meneruskan ke Controller
                 │
                 ▼
┌─────────────────────────────────┐
│   src/modules/**/controller.ts  │  ← Menerima req/res, memvalidasi input
│       (Controller Layer)        │    dengan DTO (class-validator),
└────────────────┬────────────────┘    lalu memanggil Service
                 │
                 ▼
┌─────────────────────────────────┐
│    src/modules/**/service.ts    │  ← Berisi business logic utama:
│        (Service Layer)          │    kalkulasi, integrasi pihak ketiga
└────────────────┬────────────────┘    (Midtrans, Cloudinary, Nodemailer)
                 │
                 ▼
┌─────────────────────────────────┐
│         Prisma Client           │  ← ORM untuk query & mutasi database,
│       (Data Access Layer)       │    type-safe berdasarkan schema.prisma
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│       MySQL / MariaDB           │  ← Database utama
│         (Database)              │
└─────────────────────────────────┘
```

---

### Struktur Modul

Setiap fitur ditempatkan di `src/modules/<nama-fitur>/` dengan struktur yang konsisten:

```
src/modules/
└── auth/                      # Contoh modul "auth"
    ├── auth.router.ts         # Definisi route & middleware
    ├── auth.controller.ts     # Handler request/response
    ├── auth.service.ts        # Business logic
    └── dto/
        ├── login.dto.ts       # Validasi input login
        └── register.dto.ts    # Validasi input register
```

---

### Penjelasan Tiap Layer

#### 1. `index.ts` — Bootstrap Aplikasi

File entry point yang menginisialisasi Express, mendaftarkan middleware global (CORS, body-parser, dll.), dan me-mount seluruh modul router ke dalam aplikasi.

```typescript
// src/index.ts
import "reflect-metadata";
import { container } from "tsyringe";
import express from "express";
import { AuthRouter } from "./modules/auth/auth.router";

const app = express();
app.use(express.json());

// Mount router dari setiap modul
const authRouter = container.resolve(AuthRouter);
app.use("/api/auth", authRouter.getRouter());

app.listen(process.env.PORT, () => {
  console.log(`Server berjalan di port ${process.env.PORT}`);
});
```

---

#### 2. `*.router.ts` — Router Layer

Mendefinisikan endpoint HTTP, memasang middleware (autentikasi, upload file, dsb.), lalu mendelegasikan ke method Controller yang sesuai.

```typescript
// src/modules/auth/auth.router.ts
import { Router } from "express";
import { injectable } from "tsyringe";
import { AuthController } from "./auth.controller";

@injectable()
export class AuthRouter {
  private router: Router;

  constructor(private authController: AuthController) {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes() {
    this.router.post("/register", (req, res) =>
      this.authController.register(req, res)
    );
    this.router.post("/login", (req, res) =>
      this.authController.login(req, res)
    );
  }

  getRouter(): Router {
    return this.router;
  }
}
```

---

#### 3. `*.controller.ts` — Controller Layer

Menerima `Request` dan `Response` dari Express, memvalidasi body menggunakan DTO (`class-validator`), lalu memanggil Service. Controller tidak boleh mengandung business logic.

```typescript
// src/modules/auth/auth.controller.ts
import { Request, Response } from "express";
import { injectable } from "tsyringe";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";

@injectable()
export class AuthController {
  constructor(private authService: AuthService) {}

  async register(req: Request, res: Response) {
    // 1. Transformasi body ke DTO
    const dto = plainToInstance(RegisterDto, req.body);

    // 2. Validasi input
    const errors = await validate(dto);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // 3. Delegate ke Service
    const result = await this.authService.register(dto);
    return res.status(201).json(result);
  }
}
```

---

#### 4. `*.service.ts` — Service Layer

Berisi seluruh business logic aplikasi: hash password, generate token JWT, kirim email, upload ke Cloudinary, buat transaksi Midtrans, dsb. Service berkomunikasi langsung dengan Prisma untuk operasi database.

```typescript
// src/modules/auth/auth.service.ts
import { injectable } from "tsyringe";
import { hash } from "argon2";
import { PrismaClient } from "@prisma/client";
import { RegisterDto } from "./dto/register.dto";

@injectable()
export class AuthService {
  constructor(private prisma: PrismaClient) {}

  async register(dto: RegisterDto) {
    // 1. Hash password
    const hashedPassword = await hash(dto.password);

    // 2. Simpan user ke database via Prisma
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
      },
    });

    // 3. Return response (tanpa password)
    const { password, ...result } = user;
    return result;
  }
}
```

---

#### 5. `*.dto.ts` — Data Transfer Object

Mendefinisikan struktur & aturan validasi input menggunakan decorator dari `class-validator`. Dipakai di Controller untuk memastikan data yang masuk sudah sesuai sebelum diproses.

```typescript
// src/modules/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

---

### Dependency Injection (tsyringe)

Seluruh class (Router, Controller, Service) didekorasi dengan `@injectable()` dan dikelola oleh container `tsyringe`. Ini memungkinkan dependency antar class diinjeksikan secara otomatis tanpa perlu membuat instance manual.

```
tsyringe Container
       │
       ├── AuthRouter       → membutuhkan AuthController
       ├── AuthController   → membutuhkan AuthService
       └── AuthService      → membutuhkan PrismaClient
```

> **Keuntungan:** mudah di-mock saat testing, tidak ada coupling antar modul, dan setiap class bertanggung jawab atas satu hal saja (Single Responsibility Principle).

---

## ✅ Prasyarat

Pastikan sudah terinstal di mesin Anda:

- [Bun](https://bun.sh) (runtime utama) **atau** Node.js >= 18
- [Docker](https://www.docker.com) (untuk database lokal & testing)
- Akun [Cloudinary](https://cloudinary.com) (untuk upload file)
- Akun [Midtrans](https://midtrans.com) (untuk pembayaran)
- SMTP email (Gmail, Mailtrap, dsb.)

---

## 🚀 Instalasi

### 1. Clone repository

```bash
git clone https://github.com/Baso-CODE/goenakan.id-api.git
cd goenakan.id-api
```

### 2. Install dependencies

```bash
bun install
# atau jika menggunakan npm
npm install
```

### 3. Konfigurasi environment

Salin file `.env.example` dan sesuaikan isinya:

```bash
cp .env.example .env
```

### 4. Setup database

Jalankan migrasi / push skema ke database:

```bash
# Push skema langsung (cocok untuk development)
bunx prisma db push

# Atau menggunakan migrasi (direkomendasikan untuk production)
bunx prisma migrate dev
```

### 5. (Opsional) Jalankan seeder

```bash
bun run seed
```

---

## 🔐 Environment Variables

Buat file `.env` di root proyek berdasarkan `.env.example`:

```env
# Koneksi database (MySQL/MariaDB)
DATABASE_URL=""

# Port server
PORT=8000

# Secret untuk JWT
JWT_SECRET=your_jwt_secret_here

# Konfigurasi email (SMTP)
MAIL_USER=your_email@example.com
MAIL_PASSWORD=your_email_password

# Konfigurasi Cloudinary (upload file)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

> ⚠️ **Jangan pernah commit file `.env` ke repository.** File ini sudah terdaftar di `.gitignore`.

---

## ▶️ Menjalankan Aplikasi

### Mode Development (dengan hot reload)

```bash
bun run dev
# atau
npm run dev
```

### Mode Production

```bash
# Build TypeScript ke JavaScript
bun run build

# Jalankan hasil build
bun run start
```

Server akan berjalan di `http://localhost:8000` (atau sesuai `PORT` di `.env`).

---

## 🐳 Docker

Proyek ini sudah dilengkapi `Dockerfile` dan `docker-compose.yml` untuk kemudahan deployment.

### Menjalankan dengan Docker Compose

```bash
# Jalankan semua service (API + database)
docker compose up -d
```

### Build image secara manual

```bash
docker build -t goenakan-api .
docker run -p 8000:8000 --env-file .env goenakan-api
```

> Container akan otomatis menjalankan `prisma db push` lalu memulai server saat pertama kali dijalankan.

---

## 🧪 Testing

Proyek menggunakan **Jest** dan **Supertest** untuk integration & unit testing. Database testing berjalan di container Docker terpisah agar tidak mengganggu database development.

### Persiapan

Pastikan Docker sudah berjalan, lalu nyalakan container testing:

```bash
docker compose up -d
```

### Menjalankan Tests

```bash
# Integration tests
bun run test:integration
# atau
npm run test:integration

# Unit tests
bun run test:unit
# atau
npm run test:unit
```

> File `.env.test` digunakan khusus untuk konfigurasi environment saat testing.

---

## 📜 Scripts

| Script | Perintah | Deskripsi |
|---|---|---|
| `dev` | `bun run dev` | Jalankan server development dengan hot reload |
| `build` | `bun run build` | Compile TypeScript ke JavaScript |
| `start` | `bun run start` | Jalankan server dari hasil build |
| `seed` | `bun run seed` | Isi database dengan data awal |
| `test:integration` | `bun run test:integration` | Jalankan integration tests |
| `test:unit` | `bun run test:unit` | Jalankan unit tests |

---

## 📝 Conventional Commits

Proyek ini mengikuti spesifikasi [Conventional Commits](https://www.conventionalcommits.org/) yang diperkuat oleh **Commitlint** dan **Husky**.

### Format Commit

```
<type>: <deskripsi singkat>
```

### Tipe Commit yang Tersedia

| Tipe | Deskripsi |
|---|---|
| `feat` | Penambahan fitur baru |
| `fix` | Perbaikan bug |
| `docs` | Perubahan dokumentasi |
| `refactor` | Refaktor kode (bukan fitur baru / bukan bug fix) |
| `test` | Penambahan atau perbaikan test |
| `chore` | Update dependency atau task lain yang tidak mengubah kode sumber |
| `style` | Perubahan format kode (spasi, titik koma, dll.) |
| `perf` | Peningkatan performa |

### Contoh Commit

```bash
git commit -m "feat: tambah endpoint pembayaran Midtrans"
git commit -m "fix: perbaiki validasi input pada register user"
git commit -m "docs: perbarui README dengan panduan Docker"
git commit -m "refactor: sederhanakan middleware autentikasi"
```

---

## 👤 Author

**Baso** — [@Baso-CODE](https://github.com/Baso-CODE)

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah **ISC License**.
