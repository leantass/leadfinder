# LeadFinder

LeadFinder es una plataforma para generar, priorizar, procesar y operar oportunidades comerciales. Aunque hoy adquiere datos desde Google Maps, el producto no debe presentarse ni evolucionar como un scraper: combina CRM liviano, automatización visual supervisada, monitoreo y un centro de operaciones comercial.

El flujo de producto es **adquisición → evaluación → organización → operación → automatización**. La captura es solo una entrada; el objetivo es que un equipo pueda convertir información dispersa en trabajo comercial trazable.

## Stack y requisitos

- Next.js 16, React 19 y TypeScript
- PostgreSQL y Prisma 7 (`@prisma/adapter-pg`)
- Playwright para la captura actual de Google Maps
- Node.js 20+ y npm
- Una instancia PostgreSQL accesible mediante `DATABASE_URL`

## Instalación local

```bash
git clone https://github.com/leantass/leadfinder.git
cd leadfinder
npm ci
Copy-Item .env.example .env
```

Completá `DATABASE_URL` en `.env` con una conexión PostgreSQL local o remota. No subas ese archivo: `.env*` está ignorado intencionalmente. Generá el cliente y aplicá las migraciones antes de iniciar la aplicación:

```bash
npx prisma generate
npx prisma migrate deploy
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

Para desarrollo de esquema, usá `npx prisma migrate dev --name <nombre>` en una base de desarrollo. No edites migraciones ya aplicadas. `prisma.config.ts` toma `DATABASE_URL` desde el entorno.

## Variables de entorno

Partí de [`.env.example`](./.env.example). Solo se consumen estas variables:

| Variable | Uso |
| --- | --- |
| `LEADFINDER_ADMIN_USER` | Identidad del unico operador administrador. |
| `LEADFINDER_ADMIN_PASSWORD_HASH` | Hash scrypt; nunca password plano. |
| `LEADFINDER_SESSION_SECRET` | Clave independiente de 32 bytes aleatorios, codificada como 64 caracteres hex. |
| `LEADFINDER_APP_ORIGIN` | Origen exacto del navegador, sin slash final; HTTPS en produccion. |
| `DATABASE_URL` | Conexión PostgreSQL usada por Prisma y la aplicación. |
| `AUTOMATION_RUNNER_SECRET` | Protege `GET` y `POST /api/automation/run-due-schedules`. |
| `CRON_SECRET` | Se configura en Vercel para que su cron envíe `Authorization: Bearer <CRON_SECRET>`. Debe coincidir con `AUTOMATION_RUNNER_SECRET` en el deployment. |

No hay claves de terceros configuradas en el código. La captura de Google Maps usa Playwright y puede requerir que los navegadores de Playwright estén instalados: `npx playwright install`.

## Validaciones

### Acceso privado de operador

Configurar las cuatro variables `LEADFINDER_*` antes de entrar por `/login`.
No hay registro ni multiusuario. Las operaciones manuales se conservan y las
12 Server Actions comprueban sesión antes de ejecutar lógica de negocio.
Las lecturas de páginas también comprueban sesión; el helper de IDs utilizado
exclusivamente por el runner depende de la autorización de su entrada.

El hash usa `scrypt$131072$8$1$<salt hex de 32 caracteres>$<hash hex de 128 caracteres>`.
Generarlo localmente con `crypto.scrypt`, salt aleatorio de 16 bytes, salida de
64 bytes y `maxmem: 268435456`, recibiendo la contraseña por entrada oculta o
gestor de secretos, nunca como argumento de terminal ni en código versionado.
Generar `LEADFINDER_SESSION_SECRET` con `crypto.randomBytes(32).toString("hex")`.
Los placeholders vacíos fallan cerrado; no son credenciales utilizables.

La cookie firmada HS256 dura 8 horas absolutas, es HttpOnly y SameSite=Lax;
en producción usa Secure, prefijo `__Host-`, Path=/ y ningún Domain.
“Cerrar sesión” borra la cookie mediante POST con comprobación de origen.
Una copia del token permanece válida hasta vencer; para revocar todas las
sesiones, rotar la clave de sesión. No hay tabla Prisma de usuarios/sesiones.

El cron sigue independiente del login y requiere el secret del runner.
`CRON_SECRET` y `AUTOMATION_RUNNER_SECRET` deben coincidir en Vercel; la clave
de sesión debe ser distinta. Consultar schedules vacíos devuelve `[]`, sin
crear un schedule ni habilitar autoaplicación.

Antes de exposición pública, configurar rate limit real en el hosting sobre
POST `/api/auth/login` (inicio recomendado: 5 intentos/minuto por IP y un límite
agregado ajustado al único operador). Verificar disponibilidad en el plan y
probar el rechazo. No se implementa un contador en memoria ni se configura
el hosting automáticamente. No registrar passwords, cookies ni tokens.

### Comandos

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
npm run build
npm run test:auth
```

`npm run build` y las páginas que leen datos requieren una `DATABASE_URL` válida porque el cliente Prisma se crea en el servidor. No hay suite de tests automatizados ni script `test` en este repositorio actualmente.

## Rutas y módulos

| Ruta | Estado | Propósito |
| --- | --- | --- |
| `/` | funcional | Dashboard ejecutivo con alertas y accesos al trabajo prioritario. |
| `/searches` | funcional | Ejecuta jobs de Google Maps y muestra su historial. |
| `/leads` | funcional | Pipeline por lead: búsqueda, filtros, orden, paginación server-side, detalle, notas, seguimiento e historial. |
| `/operations` | funcional | Runs, cola y automatización supervisada; schedules y auditoría del scheduler. |
| `/sources` | base visual | Describe la fuente actual (Google Maps); no administra fuentes aún. |
| `/scrapers` | base visual | Reserva la observabilidad técnica; no contiene controles de salud del scraper. |
| `/campaigns` | base visual | Reserva campañas; no hay envíos ni secuencias reales. |
| `/reports` | parcial | Muestra métricas existentes, sin analítica o exportación completa. |
| `/settings` | base visual | Expone contexto de schedules, sin editor de ajustes globales. |

## Arquitectura

- `src/app`: App Router, páginas y Server Actions.
- `src/components`: shell, panel de leads, controles de listado, operaciones y vistas base de módulos.
- `src/lib/workspace-data.ts`: consultas y normalización de la vista; el listado usa filtros, orden y paginación en servidor.
- `src/services/search-jobs.ts` + `src/scraper/google-maps.ts`: creación de `SearchJob`, captura y persistencia/enriquecimiento de leads.
- `src/lib/leads/automation-engine.ts`: decisiones y niveles de confianza de automatización.
- `src/lib/automation/schedule-runner.ts`: runs, aplicación supervisada, schedules, locks e historial de ejecuciones.
- `prisma/schema.prisma` y `prisma/migrations`: contrato de datos y migraciones versionadas.

Los datos principales son `SearchJob`, `Lead`, `LeadNote`, `LeadActivity`, `AutomationRun`, `AutomationRunItem`, `AutomationSchedule` y `AutomationSchedulerExecution`. `Lead` conserva el origen (`sourcePlatform`, `sourceUrl`), estado comercial, señales/enriquecimiento, notas, seguimiento, actividad y relación con runs.

## Automatización y runner

`/operations` puede crear runs persistidos sobre el contexto filtrado y aplicar cada decisión de forma supervisada. Un schedule almacena intervalo, filtros, política de autoaplicación, ventana horaria/quiet hours, timezone y `maxItemsPerRun`.

El runner due está disponible en `GET` y `POST /api/automation/run-due-schedules`. Exige `AUTOMATION_RUNNER_SECRET` por header `x-automation-runner-secret` o `Authorization: Bearer …`. Cada invocación crea una `AutomationSchedulerExecution`; los runs tienen `executionKey` único y los schedules usan `lockedAt` para reducir ejecuciones duplicadas o concurrentes. La autoaplicación solo continúa con ítems pendientes que cumplen la política configurada de acción y confianza.

`vercel.json` programa la ruta cada hora (`0 * * * *`, UTC). La variable `CRON_SECRET` debe estar configurada en Vercel y coincidir con el secret esperado por el endpoint. Confirmá las restricciones del plan de Vercel antes de desplegar: los planes Hobby pueden limitar la frecuencia.

Prueba manual, con la app levantada y un secret real:

```bash
curl -X POST http://localhost:3000/api/automation/run-due-schedules \
  -H "Authorization: Bearer YOUR_AUTOMATION_RUNNER_SECRET"
```

## Deployment

Configurar las variables de entorno documentadas en el proveedor, ejecutar las migraciones contra la base objetivo y desplegar la aplicación. El cron no reemplaza las migraciones ni crea la base. Revisar que la plataforma de hosting soporte la ejecución del scraper/Playwright si se pretenden lanzar búsquedas desde producción.

Para continuidad del proyecto, leer [ROADMAP.md](./ROADMAP.md) y [HANDOFF.md](./HANDOFF.md) después de este documento.
