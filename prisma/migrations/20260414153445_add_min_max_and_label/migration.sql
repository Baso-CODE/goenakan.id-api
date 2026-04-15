/*
  Warnings:

  - You are about to drop the column `quantity` on the `quotation_item_tiers` table. All the data in the column will be lost.
  - Added the required column `minQuantity` to the `quotation_item_tiers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `quotation_item_tiers` DROP COLUMN `quantity`,
    ADD COLUMN `maxQuantity` INTEGER NULL,
    ADD COLUMN `minQuantity` INTEGER NOT NULL,
    ADD COLUMN `quantityLabel` VARCHAR(191) NULL;
