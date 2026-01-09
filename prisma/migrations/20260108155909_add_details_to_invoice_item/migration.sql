-- AlterTable
ALTER TABLE `invoice_items` ADD COLUMN `customization` JSON NULL,
    ADD COLUMN `remarks` VARCHAR(191) NULL,
    ADD COLUMN `variantId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
