# Gunakan image resmi Bun (berbasis Linux Debian)
FROM oven/bun:latest

WORKDIR /app

# INI SOLUSINYA: Install library C++ manual menggunakan apt-get
# Kita install g++, make, python3, dan libstdc++ yang dibutuhkan argon2
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    openssl \
    libstdc++-12-dev

# Copy file dependency dulu (untuk caching agar build cepat)
COPY package.json bun.lock ./
COPY prisma ./prisma/

# Install dependencies
RUN bun install

ENV DATABASE_URL="mysql://johndoe:randompassword@localhost:3306/mydb"

# Generate Prisma Client (Wajib)
RUN bunx prisma generate

# Copy sisa semua file project ke dalam container
COPY . .

# Buka port 8000
EXPOSE 8000

# Perintah saat container jalan:
# 1. Push skema langsung ke database (tanpa peduli riwayat migrasi)
# 2. Jalankan aplikasi langsung dari file TypeScript
CMD ["/bin/sh", "-c", "bunx prisma db push && bun src/index.ts"]