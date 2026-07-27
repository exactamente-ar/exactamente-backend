// Todas las variables que exige src/env.ts, seteadas antes de que se importe
// cualquier módulo. Corre antes de cada archivo de test vía el preload de
// bunfig.toml.
//
// Tienen que estar TODAS: si falta alguna, env.ts corta el proceso al
// importarse. Cuando este archivo estaba incompleto los tests igual pasaban
// en local, porque tomaban los valores del .env del dev — y reventaban en CI,
// donde no hay .env. Los valores son fijos y falsos a propósito: ningún test
// debe pegarle a un servicio real.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.CORS_ORIGIN = 'http://localhost:4321';
process.env.ADMIN_ORIGIN = 'http://localhost:5173';
process.env.STORAGE_PROVIDER = 'local';
process.env.STORAGE_PATH = '/tmp/exactamente-test';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';

process.env.R2_ACCOUNT_ID = 'test-r2-account-id';
process.env.R2_ACCESS_KEY_ID = 'test-r2-access-key-id';
process.env.R2_SECRET_ACCESS_KEY = 'test-r2-secret-access-key';
process.env.R2_BUCKET_NAME = 'test-bucket';
process.env.R2_PUBLIC_URL = 'https://r2.test.invalid';

process.env.RESEND_API_KEY = 'test-resend-api-key';
process.env.APP_URL = 'http://localhost:4321';
