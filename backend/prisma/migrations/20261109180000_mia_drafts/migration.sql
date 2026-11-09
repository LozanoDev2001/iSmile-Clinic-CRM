-- crwdForce: replies Mia suggests for staff to use or dismiss.
CREATE TABLE `mia_drafts` (
    `id` CHAR(36) NOT NULL,
    `clinic_id` CHAR(36) NOT NULL,
    `conversation_id` CHAR(36) NOT NULL,
    `reply` TEXT NOT NULL,
    `summary` TEXT NOT NULL,
    `intent` VARCHAR(40) NOT NULL,
    `next_step` VARCHAR(40) NOT NULL,
    `slot_label` VARCHAR(120) NULL,
    `handover` BOOLEAN NOT NULL DEFAULT false,
    `handover_reason` VARCHAR(255) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `model` VARCHAR(60) NOT NULL,
    `input_tokens` INTEGER NOT NULL DEFAULT 0,
    `output_tokens` INTEGER NOT NULL DEFAULT 0,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decided_at` DATETIME(3) NULL,

    INDEX `mia_drafts_clinic_created`(`clinic_id`, `created_at`),
    INDEX `mia_drafts_conversation`(`conversation_id`),
    INDEX `mia_drafts_created_by`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `mia_drafts` ADD CONSTRAINT `mia_drafts_clinic_fkey` FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `mia_drafts` ADD CONSTRAINT `mia_drafts_conversation_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `mia_drafts` ADD CONSTRAINT `mia_drafts_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
