-- Messaging: platform ids and inbox ordering on conversations, message kinds,
-- marketing consent on contacts, and broadcasts.

-- AlterTable
ALTER TABLE `contacts` ADD COLUMN `marketing_opt_in` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `marketing_opt_in_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `conversations` ADD COLUMN `external_ref` VARCHAR(191) NULL,
    ADD COLUMN `last_message_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `messages` ADD COLUMN `broadcast_id` CHAR(36) NULL,
    ADD COLUMN `kind` VARCHAR(20) NOT NULL DEFAULT 'chat';

-- CreateTable
CREATE TABLE `broadcasts` (
    `id` CHAR(36) NOT NULL,
    `clinic_id` CHAR(36) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` TEXT NOT NULL,
    `audience` VARCHAR(40) NOT NULL,
    `recipient_count` INTEGER NOT NULL DEFAULT 0,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `broadcasts_clinic_created`(`clinic_id`, `created_at`),
    INDEX `broadcasts_created_by`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `conversations_inbox_idx` ON `conversations`(`clinic_id`, `last_message_at`);
CREATE UNIQUE INDEX `conversations_external_ref` ON `conversations`(`clinic_id`, `channel`, `external_ref`);
CREATE INDEX `messages_broadcast_id` ON `messages`(`broadcast_id`);

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_broadcast_fkey` FOREIGN KEY (`broadcast_id`) REFERENCES `broadcasts`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `broadcasts` ADD CONSTRAINT `broadcasts_clinic_fkey` FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `broadcasts` ADD CONSTRAINT `broadcasts_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
