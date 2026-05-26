# Admin — Stats

Requiere `Authorization: Bearer <admin_token>`.

## Endpoints

- `GET /api/v1/admin/stats` — métricas del dashboard
  - Response:
    ```ts
    {
      resources: {
        total: number
        byStatus: { pending: number, published: number, rejected: number }
        byType:   { resumen: number, parcial: number, final: number }
      }
      coverage: {
        subjectsWithResources:    number  // materias con ≥1 recurso publicado
        subjectsWithoutResources: number
      }
      counts: {
        subjects:     number
        careers:      number
        faculties:    number
        universities: number
      }
    }
    ```

## Reglas de negocio relevantes

- Una sola llamada devuelve todos los contadores — no hay endpoints individuales por métrica.
- `byStatus.pending` es el número de recursos que esperan moderación (indicador de trabajo pendiente).
- `coverage` solo cuenta recursos en estado `published` para determinar si una materia "tiene" recursos.
