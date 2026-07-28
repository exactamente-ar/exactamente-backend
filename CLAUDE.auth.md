# Auth

**Endpoints, request/response y códigos de error:** `/docs` (o `openapi.json`).

## Dos formas de cuenta, un solo usuario

Un usuario puede tener contraseña, Google, o ambos:

- Registro normal → tiene `passwordHash`.
- Registro por Google → `passwordHash: null` y `emailVerified: true`.
- Si alguien se registró con email y después entra con Google usando **el mismo
  email**, las cuentas se vinculan: se le agrega el `googleId` a la existente. No
  se crea una segunda.

**Por eso `POST /auth/login` responde `401` a los usuarios de Google**: no tienen
contraseña contra la cual comparar. No es un bug ni credenciales mal escritas.

## El flujo OAuth no expone el JWT en la URL

1. `GET /auth/google` → redirige al consent de Google.
2. `GET /auth/google/callback` → intercambia el `code`, y redirige al frontend con
   un **código de un solo uso**, no con el token.
3. `POST /auth/exchange` → canjea ese código por el JWT.

El paso 3 existe para que el JWT no quede en el historial del navegador, en los
logs del servidor ni en el header `Referer`.

Ante cualquier error el callback redirige a `CORS_ORIGIN/upload?error=...`. Es
`/upload` y **no `/login`**, que no existe en el frontend público.

## Roles

`user` < `admin` < `superadmin`. Las rutas `/admin/*` piden al menos `admin`.

Los registros nuevos son **siempre** `user`. Promover a admin es manual, en la
base.

## Tokens

- Duran 24 horas.
- **No hay refresh token.** Cuando expira, hay que loguearse de nuevo.
- `emailVerified` existe en la base pero hoy ningún flujo de producto lo usa: no
  bloquea nada.
