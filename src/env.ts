import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
  JWT_SECRET:   z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  PORT:         z.coerce.number().int().positive().default(3000),
  NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN:  z.string().min(1, 'CORS_ORIGIN es requerida'),
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
