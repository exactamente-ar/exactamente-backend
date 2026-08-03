## Qué cambia

<!-- Una o dos frases. Qué hace distinto el sistema después de esto. -->

## Por qué

<!-- El problema que resuelve. Si hay un issue, linkealo. -->

## Cómo verificarlo

<!-- Los pasos para que quien revise lo compruebe: qué correr, qué endpoint pegar, qué mirar. -->

---

- [ ] `bun test`, `bun run typecheck`, `bun run lint` y `bun run format:check` en verde
- [ ] Si toqué `src/schemas/`: corrí `bun run gen:openapi` y commiteé `openapi.json`
- [ ] Si el contrato cambió: los clientes afectados ya tienen su PR con `pnpm gen:api`
- [ ] Si agregué una migración: **se auto-aplica en producción al mergear**, y la revisé pensando en eso
