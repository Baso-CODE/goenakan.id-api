-- AlterTable
ALTER TABLE `order_products` ADD COLUMN `variantId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `order_products` ADD CONSTRAINT `order_products_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
