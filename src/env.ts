import { z } from 'zod';

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN es requerida'),
    ADMIN_ORIGIN: z.string().min(1, 'ADMIN_ORIGIN es requerida'),
    // Storage: `local` (filesystem, dev/tests) o `r2` (Cloudflare R2, prod).
    // Con `local` las vars R2 no se exigen. El default es `r2`: en producción
    // no se toca nada y la validación condicional de abajo lo respeta.
    STORAGE_PROVIDER: z.enum(['local', 'r2']).default('r2'),
    STORAGE_PATH: z.string().min(1, 'STORAGE_PATH es requerido').default('./storage'),
    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID es requerida'),
    GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET es requerida'),
    GOOGLE_REDIRECT_URI: z.string().url('GOOGLE_REDIRECT_URI debe ser una URL válida'),
    // Cloudflare R2 — presence/URL solo se validan si STORAGE_PROVIDER=r2. Son
    // string plano acá a propósito: con `min(1).optional()` un env var vacío
    // ("R2_ACCOUNT_ID=") fallaría incluso en modo local.
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_URL: z.string().optional(),
    // Blogs
    BLOG_BLACKLIST: z.string().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.STORAGE_PROVIDER === 'r2') {
      for (const key of [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET_NAME',
        'R2_PUBLIC_URL',
      ] as const) {
        if (!data[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} es requerida con STORAGE_PROVIDER=r2`,
          });
        }
      }
      if (data.R2_PUBLIC_URL && !z.string().url().safeParse(data.R2_PUBLIC_URL).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['R2_PUBLIC_URL'],
          message: 'R2_PUBLIC_URL debe ser una URL válida',
        });
      }
    }
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
