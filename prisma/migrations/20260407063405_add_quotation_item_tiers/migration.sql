/*
  Warnings:

  - You are about to drop the column `quantity` on the `quotation_items` table. All the data in the column will be lost.
  - You are about to drop the column `totalPrice` on the `quotation_items` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `quotation_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `quotation_items` DROP COLUMN `quantity`,
    DROP COLUMN `totalPrice`,
    DROP COLUMN `unitPrice`;

-- CreateTable
CREATE TABLE `quotation_item_tiers` (
    `id` VARCHAR(191) NOT NULL,
    `quotationItemId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DECIMAL(65, 30) NOT NULL,
    `totalPrice` DECIMAL(65, 30) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `quotation_item_tiers` ADD CONSTRAINT `quotation_item_tiers_quotationItemId_fkey` FOREIGN KEY (`quotationItemId`) REFERENCES `quotation_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
