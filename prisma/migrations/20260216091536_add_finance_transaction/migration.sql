-- CreateTable
CREATE TABLE `finance_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `type` ENUM('INCOME', 'EXPENSE') NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `finance_categories_name_key`(`name`),
    UNIQUE INDEX `finance_categories_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `finance_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `transactionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `type` ENUM('INCOME', 'EXPENSE') NOT NULL,
    `amount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `referenceNumber` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `method` ENUM('BANK_TRANSFER', 'CASH', 'CREDIT_CARD', 'QRIS') NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `salesId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
