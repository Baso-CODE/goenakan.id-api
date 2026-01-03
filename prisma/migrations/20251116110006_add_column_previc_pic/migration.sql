/*
  Warnings:

  - You are about to drop the column `prefix` on the `clients_b2b` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `client_b2b_pics` ADD COLUMN `prefix` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `clients_b2b` DROP COLUMN `prefix`;
