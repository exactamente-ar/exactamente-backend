// Set all required env vars before any module is imported.
// This runs before every test file via bunfig.toml preload.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET    = 'test-secret-that-is-at-least-32-characters-long';
process.env.CORS_ORIGIN   = 'http://localhost:4321';
process.env.ADMIN_ORIGIN  = 'http://localhost:5173';
process.env.STORAGE_PROVIDER = 'local';
process.env.STORAGE_PATH  = '/tmp/exactamente-test';
