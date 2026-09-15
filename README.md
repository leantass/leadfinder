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

Antes de exposición pública, configurar el secreto e ingreso confiable del
limitador PostgreSQL de POST `/api/auth/login`, según la sección Deployment.
No se configura el hosting automáticamente. No registrar passwords, cookies ni tokens.

### Comandos

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
npm run build
npm run test:auth
```

`npm run build` y las páginas que leen datos requieren una `DATABASE_URL` válida porque el cliente Prisma se crea en el servidor. Existe una suite automatizada de seguridad y autenticación mediante `npm run test:auth`; todavía no existe una suite funcional completa del producto.

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

### Google Maps runtime

El scraper fuerza `headless: true` cuando `NODE_ENV=production`; desarrollo conserva el modo visible por defecto y permite headless explícito. Cada búsqueda usa su propio browser y lo cierra al terminar o fallar. No hay user-agent custom ni stealth.

La Server Action y el scraper aceptan únicamente `maxResults` entero entre 1 y 20. `LEADFINDER_SCRAPER_TIMEOUT_MS` configura un presupuesto global de 1000 a 90000 ms (por defecto 90000), incluyendo lanzamiento, navegación y extracción. Cada navegación/selector tiene un límite de hasta 20000 ms. Al vencer el presupuesto se cierra el browser para interrumpir operaciones y se propaga el error; no se persisten candidatos parciales. El cierre libera recursos antes de devolver el error y puede añadir un breve tiempo de cleanup. El presupuesto no incluye la posterior transacción de persistencia Search.

Provisionar Chromium y sus librerías Linux para la versión instalada de Playwright; por ejemplo, en un runtime Node compatible: `npx playwright install --with-deps chromium`. La instalación debe ocurrir al preparar la imagen/runtime, no por búsqueda. Sin override, `chromium.launch` usa el browser administrado por Playwright. Opcionalmente, `LEADFINDER_CHROMIUM_EXECUTABLE_PATH` puede apuntar a un Chromium compatible instalado por el hosting; debe ser una ruta absoluta existente. No actualizar el browser independientemente sin validar compatibilidad.

Las esperas de búsqueda/detalle dependen de selectores visibles, no de sleeps fijos. Si no aparece contenido verificable, la ejecución falla con contexto; no interpreta un selector roto como cero resultados. No se automatizan consentimientos ni captchas.

Esto no demuestra compatibilidad con Vercel Functions: todavía hay que validar empaquetado del browser, librerías, memoria y duración en el hosting elegido. La prueba headless local se realiza con scraper puro o PostgreSQL descartable, sin escribir en la base operativa.

### Login rate limiting

`POST /api/auth/login` reserva en PostgreSQL cada intento antes de scrypt: 5 por IP + usuario normalizado y 20 por IP, en ventanas fijas de 15 minutos. El éxito no reinicia contadores y un bloqueo no extiende la ventana. Responde 429 con `Retry-After`; si falta configuración confiable o falla la reserva, responde 503 sin verificar credenciales.

Aplicar `20260915190000_login_rate_limit` con `npx prisma migrate deploy` y generar el cliente con `npx prisma generate`. Reiniciar los procesos Next existentes para cargar el cliente y la configuración nuevos.

Configurar `LEADFINDER_RATE_LIMIT_SECRET` con 32 bytes aleatorios codificados como 64 caracteres hexadecimales, diferente de `LEADFINDER_SESSION_SECRET` e idéntico entre instancias. Generarlo fuera del repositorio, guardarlo en el gestor de secretos del despliegue y no registrarlo en logs. Rotarlo cambia las claves y reinicia efectivamente los límites activos; no rotarlo en cada arranque.

Política de IP:

- Desarrollo: únicamente con `NODE_ENV=development` y URL/origen configurado de loopback, usar la clave fija `local-development`. Los headers del cliente se ignoran. No exponer el servidor de desarrollo públicamente.
- Vercel: con la variable de plataforma `VERCEL=1`, usar exclusivamente `x-vercel-forwarded-for`, una IP válida única proporcionada por la plataforma. No configurar `VERCEL=1` fuera de Vercel. Referencia: [headers de Vercel](https://vercel.com/docs/headers/request-headers).
- Node propio: configurar `LEADFINDER_TRUST_PROXY=true` **sólo** detrás de un proxy exclusivo que sobrescriba `x-leadfinder-client-ip` con la IP real y bloquee acceso directo al servidor. No reenviar el header del cliente ni extraer arbitrariamente el primer `X-Forwarded-For`. Sin ese contrato, el login falla cerrado con 503.

Sólo se persisten HMAC-SHA256, scope, contador e inicio/expiración. No se guardan IP, usuario, contraseña, cookies ni payload. La limpieza oportunista elimina hasta 100 registros expirados por solicitud reservada; durante inactividad pueden permanecer claves expiradas, sin influir en la admisión. No hay cron nuevo. Los backups siguen la retención de la base; HMAC es seudonimización, no anonimización irreversible.

Configurar las variables de entorno documentadas en el proveedor, ejecutar las migraciones contra la base objetivo y desplegar la aplicación. El cron no reemplaza las migraciones ni crea la base. Revisar que la plataforma de hosting soporte la ejecución del scraper/Playwright si se pretenden lanzar búsquedas desde producción.

Para continuidad del proyecto, leer [ROADMAP.md](./ROADMAP.md) y [HANDOFF.md](./HANDOFF.md) después de este documento.
