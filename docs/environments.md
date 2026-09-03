# Entornos DEV y PROD (gratis)

Un solo repo GitHub. Dos **etapas**: primero probás en DEV, después desplegás a PROD.

```
cambios locales (DEV)  →  probar  →  deploy Vercel (PROD)
```

## Recursos (free tier)

| Pieza | DEV | PROD |
|-------|-----|------|
| Código | Este repo, en tu máquina | Mismo repo, deploy a Vercel |
| Supabase | Proyecto **coolmeals-dev** (Free) | Proyecto **coolmeals-prod** (Free) |
| Kapso | **Sandbox** WhatsApp | Número real **…440** |
| Sheets | Copias “TEST” | Hojas oficiales |
| Vercel | No hace falta (localhost) | `tool-coolmeals-web` + `tool-coolmeals-api` |
| Badge UI | `DEV` (amarillo) | `PROD` (verde) |

Kapso Free: 1 número conectado + sandbox → alcanza para esta separación.

## Checklist (hacer una vez)

### 1. Supabase DEV
1. Crear proyecto `coolmeals-dev` en [supabase.com](https://supabase.com/dashboard).
2. SQL Editor: correr en orden los archivos de `supabase/migrations/`.
3. Opcional: `supabase/seed.sql`.
4. Copiar URL + anon + service_role al **`.env` local**.

### 2. Supabase PROD
1. Crear (o recuperar) `coolmeals-prod`.
2. Mismas migrations **sin seed**.
3. Pegar URL + service_role en **Vercel** → proyecto `tool-coolmeals-api` (Production).
4. Web Vercel: `NEXT_PUBLIC_SUPABASE_*` del mismo proyecto prod si aplica.

> El proyecto viejo `jrsvfyujpuuhnwzjubow` dejó de responder. No lo reutilices si sigue caído.

### 3. Variables locales (DEV)
En `.env` (raíz del repo):

```bash
APP_ENV=development
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_DEMO_MODE=false
# … keys de coolmeals-dev
KAPSO_PHONE_NUMBER_ID=<id del Sandbox>
```

### 4. Variables Vercel (PROD)
En **ambos** proyectos Vercel (web + api), Environment = **Production**:

```bash
APP_ENV=production
NEXT_PUBLIC_APP_ENV=production   # solo web
NEXT_PUBLIC_DEMO_MODE=false
# … keys de coolmeals-prod
KAPSO_PHONE_NUMBER_ID=<id del número …440>   # solo api + Kapso function
SANDBOX_RESET_ENABLED=false
```

### 5. Kapso function
Secrets de `coolmeals-bot-actions` deben apuntar a **Supabase PROD** (el bot del …440 escribe data real).

### 6. Verificar
- Local: badge **DEV** en el panel.
- Prod: badge **PROD**.
- `GET /api/cron/sandbox-reset` en prod → bloqueado si `APP_ENV=production`.

## Flujo diario

1. Desarrollás y probás en local (DEV + sandbox).
2. Cuando está OK → deploy a Vercel (PROD), como ya hacen con CLI.
3. No pegues service_role de prod en `.env` local.

## Qué no hacer

- Mismo Supabase para local y Vercel.
- Bot …440 escribiendo a DB de pruebas.
- `SANDBOX_RESET_ENABLED=true` en Vercel Production.
- Duplicar el repo “para tener dos códigos”.
