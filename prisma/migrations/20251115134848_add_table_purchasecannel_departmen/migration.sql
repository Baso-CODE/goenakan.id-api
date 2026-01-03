/*
  Warnings:

  - You are about to drop the column `department` on the `clients_b2b` table. All the data in the column will be lost.
  - You are about to drop the column `picName` on the `clients_b2b` table. All the data in the column will be lost.
  - You are about to drop the column `purchaseChannel` on the `clients_b2b` table. All the data in the column will be lost.
  - You are about to drop the column `purchaseChannel` on the `clients_b2c` table. All the data in the column will be lost.
  - Added the required column `departmentId` to the `clients_b2b` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullAddress` to the `clients_b2b` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purchaseChannelId` to the `clients_b2b` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purchaseChannelId` to the `clients_b2c` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `clients_b2b` DROP COLUMN `department`,
    DROP COLUMN `picName`,
    DROP COLUMN `purchaseChannel`,
    ADD COLUMN `departmentId` VARCHAR(191) NOT NULL,
    ADD COLUMN `fullAddress` VARCHAR(191) NOT NULL,
    ADD COLUMN `purchaseChannelId` VARCHAR(191) NOT NULL,
    MODIFY `phone` VARCHAR(191) NULL,
    MODIFY `email` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `clients_b2c` DROP COLUMN `purchaseChannel`,
    ADD COLUMN `purchaseChannelId` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `purchase_channels` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchase_channels_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_b2b_pics` (
    `id` VARCHAR(191) NOT NULL,
    `clientB2BId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `clients_b2c` ADD CONSTRAINT `clients_b2c_purchaseChannelId_fkey` FOREIGN KEY (`purchaseChannelId`) REFERENCES `purchase_channels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clients_b2b` ADD CONSTRAINT `clients_b2b_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clients_b2b` ADD CONSTRAINT `clients_b2b_purchaseChannelId_fkey` FOREIGN KEY (`purchaseChannelId`) REFERENCES `purchase_channels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_b2b_pics` ADD CONSTRAINT `client_b2b_pics_clientB2BId_fkey` FOREIGN KEY (`clientB2BId`) REFERENCES `clients_b2b`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
