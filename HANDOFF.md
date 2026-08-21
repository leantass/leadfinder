# Handoff de LeadFinder

## 1. Resumen ejecutivo

LeadFinder organiza oportunidades comerciales desde su adquisición hasta su seguimiento y automatización supervisada. La primera fuente conectada es Google Maps, pero la propuesta de valor es operacional: priorizar, registrar, decidir y ejecutar trabajo comercial con trazabilidad.

## 2. Principios de producto

- No comunicarlo ni diseñarlo como un scraper. La captura es una capacidad de adquisición, no el producto.
- Mantener foco comercial, control operativo e inteligencia comercial por lead.
- La automatización debe ser supervisada, explicable y auditable.
- Preservar el flujo: **adquisición → evaluación → organización → operación → automatización**.
- Separar módulos según la tarea del usuario, no duplicar métricas o controles en cada pantalla.

## 3. Estado actual real

Funciona la adquisición desde Google Maps, la persistencia y enriquecimiento de leads, y el trabajo individual en `/leads`: lista con query/filtros/orden/paginación server-side, estados, drawer, notas, seguimiento e historial persistido. `/operations` permite revisar y ejecutar runs, aplicar decisiones, configurar políticas de schedules y consultar ejecuciones del scheduler.

Los módulos Sources, Scrapers, Campaigns y Settings son bases visuales intencionales, no administradores completos. Reports usa datos reales pero aún no es un módulo analítico completo. No existen campañas reales, importación/manual de contactos, múltiples fuentes ni suite de tests.

## 4. Arquitectura

```text
Next.js App Router
  ├─ /searches → SearchJob → Google Maps/Playwright → Lead + enriquecimiento
  ├─ /leads → consultas Prisma server-side → notas / actividad / seguimiento
  ├─ /operations → AutomationRun + Items + Schedule + SchedulerExecution
  └─ /api/automation/run-due-schedules → runner protegido → PostgreSQL

Prisma schema + migrations → PostgreSQL
```

El contrato de datos está en `prisma/schema.prisma`. `workspace-data.ts` concentra lectura/normalización de páginas. Las mutaciones de la interfaz viven en `src/app/actions.ts`; el motor de decisión está en `src/lib/leads/automation-engine.ts` y la coordinación del scheduler en `src/lib/automation/schedule-runner.ts`.

## 5. Decisiones importantes ya tomadas

- **`/leads` vs `/operations`:** el primero es mesa de trabajo y detalle por registro; el segundo es control global de runs, cola y scheduler.
- **Filtros y paginación server-side:** evitan cargar toda la base en el cliente y preservan el contexto usado por los runs.
- **Runs persistidos:** guardan decisiones, razones, confianza, resultado e ítems para que la automatización sea revisable.
- **Schedules:** convierten un contexto de listado en una política repetible con intervalo y límites.
- **Safe auto-apply:** solo aplica ítems pending cuyas acciones y confianza cumplen la política del schedule.
- **Quiet hours, timezone y maxItemsPerRun:** acotan cuándo y cuánto puede operar un schedule.
- **Locking, `executionKey` e historial de scheduler:** reducen doble ejecución y mantienen evidencia de cada invocación.

## 6. Deuda técnica y riesgos conocidos

- No hay script ni suite de tests automatizados.
- `npm run build` requiere `DATABASE_URL`, porque las páginas del servidor inicializan Prisma; una base no migrada o inaccesible impide validar el build completo.
- El scraper depende de selectores de Google Maps y de Playwright; puede romperse si el sitio cambia o el entorno de deployment no permite navegador.
- El cron está configurado, pero su frecuencia efectiva depende del plan y la configuración de Vercel.
- El endpoint usa `AUTOMATION_RUNNER_SECRET`; `CRON_SECRET` solo cobra efecto si la plataforma de cron lo envía como Bearer. Configurarlos de forma consistente es responsabilidad de deployment.

## 7. Qué no debe romperse

- No exponer secretos ni versionar `.env`.
- No mezclar la operación individual de `/leads` con la automatización global de `/operations`.
- Mantener filtros, orden y paginación en servidor para las vistas de leads/operaciones.
- Mantener runs, ítems y ejecuciones del scheduler persistidos; no convertir acciones automáticas en efectos sin auditoría.
- Preservar la protección del endpoint, el lock, la idempotencia, las quiet hours y los límites antes de ampliar la automatización.
- No convertir campañas o módulos base en funcionalidades “hechas” hasta que tengan persistencia, controles y validación real.

## 8. Próximo foco recomendado

Consolidar los módulos visuales y el Dashboard ejecutivo; después crear Contactos y la entrada manual (individual y por copy-paste/importación), con validación y origen explícito. Integrar esos contactos al mismo flujo de Leads/seguimiento/automatización. Recién después ajustar Leads y avanzar con campañas/reportes.

## 9. GitHub

Repositorio: `leantass/leadfinder` (`https://github.com/leantass/leadfinder`). Existe un GitHub Project llamado **LeadFinder** y hay issues de producto. Usarlos como referencia de priorización, pero contrastarlos siempre con el código, las migraciones y este handoff: pueden estar desactualizados respecto de la implementación.

## 10. Primer día del próximo desarrollador

1. Clonar el repositorio y leer README, ROADMAP y este documento.
2. Copiar `.env.example` a `.env` y configurar una PostgreSQL de desarrollo.
3. Ejecutar `npm ci`, `npx prisma generate` y `npx prisma migrate deploy`.
4. Ejecutar `npm run dev` y recorrer `/`, `/searches`, `/leads` y `/operations`.
5. Ejecutar `npx prisma validate`, `npx tsc --noEmit`, `npm run lint` y el build con DB disponible.
6. Revisar `prisma/schema.prisma` y todas las migraciones antes de modificar Prisma.
7. Revisar los issues y el GitHub Project contra el estado real del código.
8. Confirmar la configuración de secretos y cron antes de tocar automatización o deployment.
