-- Price-list items are services or products; VAT is decided per invoice, not per item.
ALTER TABLE `service_catalog` CHANGE COLUMN `tax_type` `kind` VARCHAR(20) NOT NULL DEFAULT 'service';
UPDATE `service_catalog` SET `kind` = CASE WHEN `kind` = 'vat' THEN 'product' ELSE 'service' END;

-- AlterTable
ALTER TABLE `claims` ADD COLUMN `loa_no` VARCHAR(60) NULL;

-- AlterTable
ALTER TABLE `invoice_items` ADD COLUMN `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE `invoices` ADD COLUMN `appointment_id` CHAR(36) NULL,
    ADD COLUMN `discount_id_no` VARCHAR(60) NULL,
    ADD COLUMN `discount_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `discount_type` VARCHAR(10) NOT NULL DEFAULT 'none',
    ADD COLUMN `hmo_due` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `vat_exempt_sales` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `vatable_sales` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `void_reason` TEXT NULL,
    ADD COLUMN `voided_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `appointment_id` ON `invoices`(`appointment_id`);

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_appointment_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
