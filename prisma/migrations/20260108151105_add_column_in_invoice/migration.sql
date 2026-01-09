/*
  Warnings:

  - You are about to alter the column `invoiceId` on the `invoice_items` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `invoices` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `invoices` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - A unique constraint covering the columns `[invoiceNumber]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `invoice_items` DROP FOREIGN KEY `invoice_items_invoiceId_fkey`;

-- AlterTable
ALTER TABLE `invoice_items` MODIFY `invoiceId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `invoices` DROP PRIMARY KEY,
    ADD COLUMN `invoiceNumber` VARCHAR(191) NULL,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- CreateIndex
CREATE UNIQUE INDEX `invoices_invoiceNumber_key` ON `invoices`(`invoiceNumber`);

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
