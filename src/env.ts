import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
  JWT_SECRET:   z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  PORT:         z.coerce.number().int().positive().default(3000),
  NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN:  z.string().min(1, 'CORS_ORIGIN es requerida'),
  ADMIN_ORIGIN: z.string().min(1, 'ADMIN_ORIGIN es requerida'),
  // Cloudflare R2
  R2_ACCOUNT_ID:       z.string().min(1, 'R2_ACCOUNT_ID es requerida'),
  R2_ACCESS_KEY_ID:    z.string().min(1, 'R2_ACCESS_KEY_ID es requerida'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY es requerida'),
  R2_BUCKET_NAME:      z.string().min(1, 'R2_BUCKET_NAME es requerida'),
  R2_PUBLIC_URL:       z.string().url('R2_PUBLIC_URL debe ser una URL válida'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas o faltantes:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
