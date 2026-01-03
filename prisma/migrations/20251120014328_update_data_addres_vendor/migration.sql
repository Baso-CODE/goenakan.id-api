-- AlterTable
ALTER TABLE `clients_b2c` MODIFY `phone` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `vendors` ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `district` VARCHAR(191) NULL,
    ADD COLUMN `postalCode` VARCHAR(191) NULL,
    ADD COLUMN `province` VARCHAR(191) NULL,
    ADD COLUMN `subDistrict` VARCHAR(191) NULL,
    MODIFY `country` VARCHAR(191) NULL;
