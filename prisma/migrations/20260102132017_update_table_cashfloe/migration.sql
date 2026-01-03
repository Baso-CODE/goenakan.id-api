-- DropForeignKey
ALTER TABLE `cashflow_revenue` DROP FOREIGN KEY `cashflow_revenue_productId_fkey`;

-- AlterTable
ALTER TABLE `cashflow_revenue` MODIFY `productId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `cashflow_revenue` ADD CONSTRAINT `cashflow_revenue_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
