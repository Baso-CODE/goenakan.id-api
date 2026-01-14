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
COPY package.json bun.lockb ./
COPY prisma ./prisma/

# Install dependencies
RUN bun install

# Generate Prisma Client (Wajib)
RUN bunx prisma generate

# Copy sisa semua file project ke dalam container
COPY . .

# Buka port 8000
EXPOSE 8000

# Perintah saat container jalan:
# 1. Migrasi database
# 2. Jalankan aplikasi langsung dari file TypeScript
CMD ["/bin/sh", "-c", "bunx prisma migrate deploy && bun src/index.ts"]