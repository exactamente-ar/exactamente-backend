/**
 * Valores falsos para las variables que exige `src/env.ts`.
 *
 * Hay dos contextos donde se importa la app sin querer conectarse a nada:
 * los tests y la generación del OpenAPI. En ambos, `env.ts` corta el proceso
 * al importarse si falta una variable.
 *
 * Vive acá, en un solo lugar, porque ya se duplicó una vez: el setup de tests
 * tenía la lista incompleta, en local pasaba tomando el resto del .env del dev,
 * y en CI —sin .env— la suite ni arrancaba.
 *
 * Los valores son inventados a propósito. Nada que los use debe pegarle a un
 * servicio real.
 */
export const PLACEHOLDER_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  CORS_ORIGIN: 'http://localhost:4321',
  ADMIN_ORIGIN: 'http://localhost:5173',

  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: '/tmp/exactamente-test',

  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/google/callback',

  R2_ACCOUNT_ID: 'test-r2-account-id',
  R2_ACCESS_KEY_ID: 'test-r2-access-key-id',
  R2_SECRET_ACCESS_KEY: 'test-r2-secret-access-key',
  R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_URL: 'https://r2.test.invalid',

  RESEND_API_KEY: 'test-resend-api-key',
  APP_URL: 'http://localhost:4321',
};

/**
 * Aplica los placeholders PISANDO lo que haya en el entorno.
 *
 * Es a propósito y no es negociable: si el `.env` del dev ganara, los tests
 * darían distinto en cada máquina. Hay tests que afirman sobre estos valores
 * exactos —`routes.auth.google.test.ts` chequea `client_id=test-google-client-id`
 * en la URL de consent— y con un `.env` local encima fallan solo acá y pasan
 * en CI, que es la peor combinación posible.
 *
 * Misma razón para el generador de OpenAPI: el spec tiene que salir idéntico
 * en cualquier máquina.
 */
export function applyPlaceholderEnv(): void {
  for (const [key, value] of Object.entries(PLACEHOLDER_ENV)) {
    process.env[key] = value;
  }
}
