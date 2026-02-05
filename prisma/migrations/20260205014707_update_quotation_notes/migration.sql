/*
  Warnings:

  - You are about to drop the column `internalNotes` on the `quotations` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `quotations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `quotations` DROP COLUMN `internalNotes`,
    DROP COLUMN `notes`;

-- CreateTable
CREATE TABLE `quotation_note_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `templates` JSON NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotation_notes` (
    `id` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `quotation_notes` ADD CONSTRAINT `quotation_notes_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `quotations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotation_notes` ADD CONSTRAINT `quotation_notes_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `quotation_note_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
