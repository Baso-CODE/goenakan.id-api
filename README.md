# 🍽️ Goenakan.id API

Backend RESTful API untuk platform **Goenakan.id** — dibangun dengan **Express**, **Prisma**, **TypeScript**, dan **Dependency Injection (tsyringe)**. API ini mendukung autentikasi, manajemen pengguna, pembayaran via Midtrans, upload file ke Cloudinary, pengiriman email, serta berbagai fitur CRUD.

---

## 📋 Daftar Isi

- [Tech Stack](#-tech-stack)
- [Struktur Proyek](#-struktur-proyek)
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
