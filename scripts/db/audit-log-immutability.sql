-- Optional hardening: make `audit_logs` append-only at the database level.
-- The application never updates or deletes audit rows, but these triggers
-- guarantee it even for anyone holding the application's DB credentials.
--
-- Run once per environment, after migrations, as a user with TRIGGER
-- privilege (with binary logging enabled MySQL may also require SUPER or
-- log_bin_trust_function_creators=1):
--   mysql -u admin -p ismile_crm < scripts/db/audit-log-immutability.sql
--
-- Retention/archiving must then be done by a DBA (drop the triggers in a
-- controlled maintenance window, archive, recreate).

DROP TRIGGER IF EXISTS audit_logs_no_update;
DROP TRIGGER IF EXISTS audit_logs_no_delete;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';

CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';

-- Recommended least-privilege grants for the application user:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ismile_crm.* TO 'ismile_app'@'%';
--   REVOKE UPDATE, DELETE ON ismile_crm.audit_logs FROM 'ismile_app'@'%';
-- (MySQL cannot revoke table privileges granted at schema level; grant per
--  table instead if you want to rely on privileges rather than triggers.)
