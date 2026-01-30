-- CreateTable
CREATE TABLE `popup_banners` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `desktopImageUrl` VARCHAR(191) NOT NULL,
    `desktopImagePublicId` VARCHAR(191) NOT NULL,
    `mobileImageUrl` VARCHAR(191) NOT NULL,
    `mobileImagePublicId` VARCHAR(191) NOT NULL,
    `altText` VARCHAR(191) NULL,
    `linkUrl` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
