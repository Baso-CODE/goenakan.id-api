/*
  Warnings:

  - Added the required column `categoryId` to the `articles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `coverImage` to the `articles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `articles` ADD COLUMN `categoryId` VARCHAR(191) NOT NULL,
    ADD COLUMN `coverImage` VARCHAR(191) NOT NULL,
    ADD COLUMN `coverImageId` VARCHAR(191) NULL,
    ADD COLUMN `publishedAt` DATETIME(3) NULL,
    ADD COLUMN `source` TEXT NULL,
    MODIFY `title` VARCHAR(255) NOT NULL,
    MODIFY `content` LONGTEXT NOT NULL;

-- CreateTable
CREATE TABLE `article_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `article_categories_name_key`(`name`),
    UNIQUE INDEX `article_categories_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article_products` (
    `articleId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`articleId`, `productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `articles` ADD CONSTRAINT `articles_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `article_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_products` ADD CONSTRAINT `article_products_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_products` ADD CONSTRAINT `article_products_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
