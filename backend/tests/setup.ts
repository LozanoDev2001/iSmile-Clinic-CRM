// Keep test output readable; set LOG_SILENT=false to debug.
process.env.LOG_SILENT ??= "true";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123";
process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/ismile_unit_never_connected";
