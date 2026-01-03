-- AlterTable
ALTER TABLE `orders` ADD COLUMN `purchaseChannelId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_purchaseChannelId_fkey` FOREIGN KEY (`purchaseChannelId`) REFERENCES `purchase_channels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
