-- CreateTable
CREATE TABLE `article_banners` (
    `id` VARCHAR(191) NOT NULL,
    `backgroundColor` VARCHAR(50) NOT NULL,
    `buttonText` VARCHAR(100) NOT NULL,
    `ctaLink` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `articleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `article_banners` ADD CONSTRAINT `article_banners_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
