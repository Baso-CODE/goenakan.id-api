/*
  Warnings:

  - Added the required column `imagePublicId` to the `hero_slides` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `hero_slides` ADD COLUMN `imagePublicId` VARCHAR(191) NOT NULL;
