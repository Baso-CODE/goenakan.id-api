
# ============================================================
# GOENAKAN BACKEND API
# Runtime : Bun
# Database: MySQL + Prisma ORM
# Deploy  : Docker / Dokploy
# Port    : 8000
# ============================================================

# Gunakan versi Bun yang sudah ditentukan untuk production.
# Ganti versi ini dengan versi yang sudah teruji pada project.
FROM oven/bun:1

WORKDIR /app

# ============================================================
# 1. SYSTEM DEPENDENCIES
# ============================================================
# Dibutuhkan oleh native modules seperti argon2,
# serta OpenSSL untuk kompatibilitas Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 2. INSTALL PROJECT DEPENDENCIES
# ============================================================
# Copy dependency terlebih dahulu agar Docker layer caching
# tetap efektif ketika hanya source code yang berubah.
COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

# ============================================================
# 3. COPY SOURCE CODE
# ============================================================
COPY . .

# ============================================================
# 4. GENERATE PRISMA CLIENT
# ============================================================
# Prisma generate hanya menghasilkan Prisma Client.
# Perintah ini TIDAK mengubah schema atau data database.
RUN bunx prisma generate

# ============================================================
# 5. APPLICATION ENVIRONMENT
# ============================================================
ENV NODE_ENV=production

# DATABASE_URL, Midtrans keys, GA4 credentials,
# dan environment sensitif lainnya diatur melalui Dokploy.
#
# Jangan menyimpan credential database di Dockerfile.

# ============================================================
# 6. DATABASE / PRISMA SAFETY POLICY
# ============================================================
#
# PENTING:
# PERUBAHAN SCHEMA PRISMA WAJIB DILAKUKAN SECARA MANUAL.
#
# Dockerfile ini TIDAK menjalankan:
#
#   prisma db push
#   prisma db push --accept-data-loss
#   prisma migrate deploy
#   prisma migrate reset
#
# Setiap perubahan database harus melalui:
#
# 1. Review perubahan prisma/schema.prisma
# 2. Backup database sebelum perubahan production
# 3. Periksa dampak perubahan terhadap data existing
# 4. Jalankan migration atau schema update secara manual
# 5. Verifikasi database sebelum deploy aplikasi terbaru
#
# CATATAN:
# Jangan gunakan --accept-data-loss secara otomatis.
# Untuk perubahan destruktif, lakukan migrasi data
# dan verifikasi secara terkontrol.
#
# ============================================================

# ============================================================
# 7. EXPOSE API PORT
# ============================================================
EXPOSE 8000

# ============================================================
# 8. START BACKEND API
# ============================================================
# Hanya menjalankan Express API.
# Tidak ada operasi perubahan schema database saat startup.
#
# GA4 Tracking Worker dijalankan sebagai service terpisah
# melalui Dokploy.
CMD ["bun", "src/index.ts"]
