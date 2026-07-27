/**
 * Schemas compartidos que describen lo que la API DEVUELVE.
 *
 * Importan de `zod/v4` (ya incluido en zod 3.25) por su `z.toJSONSchema()`
 * nativo, que es lo que alimenta el OpenAPI. Los validators de entrada en
 * `src/validators/` siguen en el zod clásico y no se tocan.
 *
 * Regla: estos schemas describen la realidad de los handlers, no el ideal.
 * Si un handler devuelve un campo, va acá aunque `src/types/index.ts` no lo
 * mencionara.
 */
import { z } from 'zod/v4';

/** Timestamps: los handlers los serializan con `.toISOString()`. */
export const IsoDateTime = z.iso.datetime();

/**
 * Envoltorio de paginación de `buildPaginatedResponse()` (src/utils/paginate.ts).
 *
 * El `id` nombra el schema en `components/schemas` del OpenAPI, para que los
 * clientes generen un tipo con nombre y no una estructura anónima.
 */
export function paginated<T extends z.ZodType>(item: T, id: string) {
  return z
    .object({
      data: z.array(item),
      total: z.number().int(),
      page: z.number().int(),
      totalPages: z.number().int(),
    })
    .meta({ id });
}

/** Forma única de error de la API. Ver la tabla de códigos en CLAUDE.md. */
export const ErrorResponseSchema = z
  .object({
    error: z.string().describe('Mensaje descriptivo, apto para mostrar al usuario'),
  })
  .meta({ id: 'ErrorResponse' });

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
