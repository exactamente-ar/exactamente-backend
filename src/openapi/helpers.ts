/**
 * Azúcar sobre `describeRoute()` para que describir una ruta sea una línea y
 * no seis niveles de anidado.
 *
 * Sin esto, cada endpoint necesita:
 *   responses: { 200: { description, content: { 'application/json': { schema: resolver(S) } } } }
 * y con 35 endpoints eso es puro ruido.
 */
import { resolver } from 'hono-openapi';
import type { DescribeRouteOptions } from 'hono-openapi';
import type { z } from 'zod/v4';
import { ErrorResponseSchema } from '@/schemas';

type Responses = NonNullable<DescribeRouteOptions['responses']>;

/** Una respuesta JSON con su schema. */
export function json(schema: z.ZodType, description: string) {
  return {
    description,
    content: { 'application/json': { schema: resolver(schema) } },
  };
}

/**
 * Errores: todos comparten la misma forma `{ error: string }`, así que se
 * declaran por código y listo. Ver la tabla de códigos en CLAUDE.md.
 */
const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Validación fallida',
  401: 'Sin token o token inválido',
  403: 'Rol insuficiente',
  404: 'Recurso no encontrado',
  409: 'Conflicto de estado',
  429: 'Rate limit excedido',
};

export function errors(...codes: number[]): Responses {
  return Object.fromEntries(
    codes.map((code) => [code, json(ErrorResponseSchema, ERROR_DESCRIPTIONS[code] ?? 'Error')]),
  );
}

/**
 * Toda ruta protegida lleva `Authorization: Bearer <jwt>`. El esquema de
 * seguridad se declara una vez en src/openapi/document.ts.
 */
export const bearerAuth = [{ bearerAuth: [] }];
