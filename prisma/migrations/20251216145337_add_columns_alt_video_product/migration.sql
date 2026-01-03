-- AlterTable
ALTER TABLE `product_videos` ADD COLUMN `altText` VARCHAR(191) NULL,
    ADD COLUMN `isFeatured` BOOLEAN NOT NULL DEFAULT false;
