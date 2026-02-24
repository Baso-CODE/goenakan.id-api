-- AlterTable
ALTER TABLE `quotations` ADD COLUMN `salesId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
