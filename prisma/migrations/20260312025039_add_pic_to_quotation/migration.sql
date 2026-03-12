-- AlterTable
ALTER TABLE `quotations` ADD COLUMN `picId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_picId_fkey` FOREIGN KEY (`picId`) REFERENCES `client_b2b_pics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
