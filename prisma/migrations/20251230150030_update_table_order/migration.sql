-- AlterTable
ALTER TABLE `orders` ADD COLUMN `clientB2BPICId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_clientB2BPICId_fkey` FOREIGN KEY (`clientB2BPICId`) REFERENCES `client_b2b_pics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
