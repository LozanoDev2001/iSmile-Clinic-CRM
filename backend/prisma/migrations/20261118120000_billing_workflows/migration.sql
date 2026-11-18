-- Billing tabs: HMO claim payments, payment plan installments paid through a payment, bank deposit references.
ALTER TABLE `bank_transactions` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `reference` VARCHAR(80) NULL;

ALTER TABLE `claims` ADD COLUMN `denied_reason` VARCHAR(255) NULL,
    ADD COLUMN `paid_amount` DECIMAL(12, 2) NULL,
    ADD COLUMN `paid_at` DATETIME(3) NULL,
    ADD COLUMN `payment_ref` VARCHAR(80) NULL;

ALTER TABLE `payment_installments` ADD COLUMN `paid_at` DATETIME(3) NULL,
    ADD COLUMN `payment_id` CHAR(36) NULL;

CREATE INDEX `claims_status_idx` ON `claims`(`clinic_id`, `status`);

CREATE INDEX `installment_payment_id` ON `payment_installments`(`payment_id`);

ALTER TABLE `payment_installments` ADD CONSTRAINT `payment_installments_payment_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
