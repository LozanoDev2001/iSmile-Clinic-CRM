-- AlterTable
ALTER TABLE `contacts` ADD COLUMN `address` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `patients` ADD COLUMN `civil_status` VARCHAR(40) NULL,
    ADD COLUMN `hmo_member_no` VARCHAR(60) NULL,
    ADD COLUMN `medical_conditions` TEXT NULL,
    ADD COLUMN `medications` TEXT NULL,
    ADD COLUMN `occupation` VARCHAR(120) NULL,
    ADD COLUMN `payer_id` CHAR(36) NULL,
    ADD COLUMN `sc_pwd_id` VARCHAR(60) NULL;

-- CreateIndex
CREATE INDEX `payer_id` ON `patients`(`payer_id`);

-- AddForeignKey
ALTER TABLE `patients` ADD CONSTRAINT `patients_payer_fkey` FOREIGN KEY (`payer_id`) REFERENCES `payers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
