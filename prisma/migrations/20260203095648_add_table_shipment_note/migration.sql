/*
  Warnings:

  - You are about to drop the column `remarks` on the `shipments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `shipments` DROP COLUMN `remarks`;

-- CreateTable
CREATE TABLE `shipment_note_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `templates` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipment_notes` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shipment_notes` ADD CONSTRAINT `shipment_notes_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipment_notes` ADD CONSTRAINT `shipment_notes_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `shipment_note_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
