/*
  Warnings:

  - You are about to drop the column `paymentType` on the `invoices` table. All the data in the column will be lost.
  - You are about to alter the column `status` on the `invoices` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(8))` to `Enum(EnumId(2))`.

*/
-- AlterTable
ALTER TABLE `invoices` DROP COLUMN `paymentType`,
    ADD COLUMN `category` ENUM('DP', 'FULL_PAYMENT', 'INSTALLMENT', 'REMAINING_BALANCE') NOT NULL DEFAULT 'FULL_PAYMENT',
    ADD COLUMN `dueDate` DATETIME(3) NULL,
    ADD COLUMN `method` ENUM('BANK_TRANSFER', 'CASH', 'CREDIT_CARD', 'QRIS') NULL,
    MODIFY `status` ENUM('DRAFT', 'UNPAID', 'PAID', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'UNPAID';
