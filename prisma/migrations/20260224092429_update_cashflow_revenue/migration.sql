-- DropForeignKey
ALTER TABLE `cashflow_cost` DROP FOREIGN KEY `cashflow_cost_vendorId_fkey`;

-- AlterTable
ALTER TABLE `cashflow_cost` MODIFY `vendorId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `cashflow_cost` ADD CONSTRAINT `cashflow_cost_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
