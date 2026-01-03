-- AlterTable
ALTER TABLE `product_variant_images` MODIFY `isFeatured` BOOLEAN NULL DEFAULT false;

-- AlterTable
ALTER TABLE `product_variants` ADD COLUMN `variantName` VARCHAR(191) NULL;
