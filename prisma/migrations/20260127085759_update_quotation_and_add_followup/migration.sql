/*
  Warnings:

  - You are about to drop the column `price` on the `quotation_items` table. All the data in the column will be lost.
  - Added the required column `productName` to the `quotation_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalPrice` to the `quotation_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitPrice` to the `quotation_items` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `quotation_items` DROP FOREIGN KEY `quotation_items_productId_fkey`;

-- DropForeignKey
ALTER TABLE `quotation_items` DROP FOREIGN KEY `quotation_items_quotationId_fkey`;

-- DropForeignKey
ALTER TABLE `quotations` DROP FOREIGN KEY `quotations_clientId_fkey`;

-- AlterTable
ALTER TABLE `quotation_items` DROP COLUMN `price`,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `discount` DECIMAL(65, 30) NULL DEFAULT 0,
    ADD COLUMN `productName` VARCHAR(191) NOT NULL,
    ADD COLUMN `totalPrice` DECIMAL(65, 30) NOT NULL,
    ADD COLUMN `unitPrice` DECIMAL(65, 30) NOT NULL,
    MODIFY `productId` VARCHAR(191) NULL,
    MODIFY `customization` JSON NULL,
    MODIFY `remarks` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `quotations` ADD COLUMN `discountAmount` DECIMAL(65, 30) NULL DEFAULT 0,
    ADD COLUMN `internalNotes` TEXT NULL,
    ADD COLUMN `manualClientAddress` TEXT NULL,
    ADD COLUMN `manualClientCompany` VARCHAR(191) NULL,
    ADD COLUMN `manualClientEmail` VARCHAR(191) NULL,
    ADD COLUMN `manualClientName` VARCHAR(191) NULL,
    ADD COLUMN `manualClientPhone` VARCHAR(191) NULL,
    ADD COLUMN `subTotal` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    ADD COLUMN `taxAmount` DECIMAL(65, 30) NULL DEFAULT 0,
    ADD COLUMN `validUntil` DATETIME(3) NULL,
    MODIFY `clientId` VARCHAR(191) NULL,
    MODIFY `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `totalAmount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    MODIFY `status` ENUM('DRAFT', 'SENT', 'FOLLOW_UP', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    MODIFY `notes` TEXT NULL;

-- CreateTable
CREATE TABLE `quotation_follow_ups` (
    `id` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `method` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `nextAction` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotation_follow_ups` ADD CONSTRAINT `quotation_follow_ups_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `quotations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `quotations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
