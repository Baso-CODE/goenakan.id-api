/*
  Warnings:

  - You are about to alter the column `status` on the `shipments` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(11))`.

*/
-- AlterTable
ALTER TABLE `shipments` ADD COLUMN `step` INTEGER NOT NULL DEFAULT 1,
    MODIFY `status` ENUM('PENDING', 'PREPARED', 'DISPATCHED', 'ARRIVED', 'CANCELLED') NOT NULL DEFAULT 'PREPARED';
