-- AlterTable
ALTER TABLE `invoices` ADD COLUMN `paidAt` DATETIME(3) NULL,
    ADD COLUMN `paymentDate` DATETIME(3) NULL;
