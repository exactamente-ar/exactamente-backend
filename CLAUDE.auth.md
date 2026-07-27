# Auth

## Endpoints

- `POST /api/v1/auth/register` — registrar usuario nuevo
  - Request: `{ email, password (min 8 chars), displayName (2-100 chars) }`
  - Response 201: `{ user: PublicUser, token: string }`
  - Errores: `409` email ya registrado · `400` validación
  - Rate limit: 5 req/hora por IP

- `POST /api/v1/auth/login` — iniciar sesión
  - Request: `{ email, password }`
  - Response 200: `{ user: PublicUser, token: string }`
  - Errores: `401` credenciales inválidas
  - Rate limit: 10 req/15 min por IP

- `GET /api/v1/auth/me` — usuario autenticado actual
  - Auth: requerida
  - Response: `{ user: PublicUser }`
  - Errores: `401` · `404`

## Google OAuth

### GET /api/v1/auth/google

Redirige al consent screen de Google (302).

No requiere body ni auth.

Rate limit: 20 req / 15 min por IP.

---

### GET /api/v1/auth/google/callback

Recibe el callback de Google después del consent. Intercambia el `code` por un JWT propio y redirige al frontend.

**Query params:**

- `code` — authorization code de Google (presente si el usuario aceptó)
- `error` — presente si el usuario rechazó o hubo error en Google

**Flujo:**

1. Si hay `error` o falta `code` → redirect a `CORS_ORIGIN/login?error=oauth_denied`
2. Intercambia `code` por access_token en Google
3. Obtiene perfil del usuario desde Google (`id`, `email`, `name`)
4. Busca usuario por `googleId` o `email`:
   - No existe → crea usuario con `emailVerified: true`, `passwordHash: null`
   - Existe sin `googleId` → vincula la cuenta (email/password) con Google
   - Existe con `googleId` → login normal
5. Firma JWT y redirige a `CORS_ORIGIN/auth/callback?token=<jwt>`
6. Si falla el intercambio con Google → redirect a `CORS_ORIGIN/login?error=oauth_failed`

Rate limit: 20 req / 15 min por IP.

---

**Nota:** Los usuarios creados vía Google tienen `passwordHash = null`.
El endpoint `POST /auth/login` rechaza con 401 si el usuario no tiene `passwordHash`.

## Schemas / Tipos principales

```ts
PublicUser {
  id: string          // UUID
  email: string
  displayName: string
  role: 'user' | 'admin' | 'superadmin'
}
```

El token es un JWT — incluir en todas las rutas protegidas:

```
Authorization: Bearer <token>
```

## Reglas de negocio relevantes

- Registros nuevos siempre tienen `role: 'user'`.
- No hay endpoint de refresh token — el token expira y el usuario debe loguearse de nuevo.
- `emailVerified` existe en DB pero no se usa en ningún flujo de producto actualmente.
