-- AlterTable
ALTER TABLE `quotation_items` ADD COLUMN `variantId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
