/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `vendor_categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `vendor_items` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `vendors` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `vendor_categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `vendor_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `vendors` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `contact_platforms` ALTER COLUMN `id` DROP DEFAULT;

-- AlterTable
ALTER TABLE `vendor_categories` ADD COLUMN `slug` VARCHAR(191) NOT NULL,
    ALTER COLUMN `id` DROP DEFAULT;

-- AlterTable
ALTER TABLE `vendor_contacts` ALTER COLUMN `id` DROP DEFAULT;

-- AlterTable
ALTER TABLE `vendor_items` ADD COLUMN `slug` VARCHAR(191) NOT NULL,
    ALTER COLUMN `id` DROP DEFAULT;

-- AlterTable
ALTER TABLE `vendors` ADD COLUMN `slug` VARCHAR(191) NOT NULL,
    ALTER COLUMN `id` DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX `vendor_categories_slug_key` ON `vendor_categories`(`slug`);

-- CreateIndex
CREATE UNIQUE INDEX `vendor_items_slug_key` ON `vendor_items`(`slug`);

-- CreateIndex
CREATE UNIQUE INDEX `vendors_slug_key` ON `vendors`(`slug`);
