# Roadmap de LeadFinder

Este roadmap refleja el código y las migraciones presentes en el repositorio. “Implementado” no implica que esté probado contra todas las bases o proveedores de producción.

## Implementado

- Base Next.js/TypeScript con PostgreSQL/Prisma y migraciones versionadas.
- Dashboard ejecutivo con prioridades y accesos a módulos.
- Búsquedas de Google Maps que crean `SearchJob`, capturan hasta el límite indicado, enriquecen y persisten leads.
- Pipeline de leads con búsqueda, filtros, orden y paginación en servidor (20/50/100), estado comercial, drawer de detalle, notas, seguimiento e historial de actividad persistidos.
- Origen de captura por lead (`sourcePlatform` y `sourceUrl`) y señales comerciales/enriquecimiento.
- Automatización por lead y por lote: decisiones, confianza, runs e ítems de run persistidos y aplicación supervisada.
- Schedules persistidos con intervalo, política de autoaplicación, ventana horaria/quiet hours, timezone, máximo de ítems, lock e idempotencia por `executionKey`.
- Auditoría de ejecuciones mediante `AutomationSchedulerExecution` y endpoint protegido para ejecutar schedules vencidos.
- Cron de Vercel definido en `vercel.json`.

## Parcial / en progreso

- Modularización visual: `/sources`, `/scrapers`, `/campaigns` y `/settings` tienen lugar y contexto en la navegación, pero no implementan su operación completa.
- Dashboard: ya es ejecutivo y acotado; faltan criterios y métricas más maduras según el uso real.
- Reportes: muestra métricas existentes, pero no tiene analítica profunda, comparativas ni exportaciones.
- Automatización: los controles, auditabilidad y salvaguardas existen; su eficacia comercial necesita validación con operaciones reales y no reemplaza revisión humana.
- Captura: Google Maps está conectada, pero no hay observabilidad técnica, manejo avanzado de fallas ni múltiples fuentes.

## Pendiente, en orden recomendado

1. Consolidar la modularización visual y definir qué métricas ejecutivas merecen permanecer en el Dashboard.
2. Crear el módulo Contactos y la carga manual individual de teléfonos/contactos.
3. Incorporar carga por copy-paste e importación; validar y normalizar entradas antes de persistirlas.
4. Distinguir de forma explícita el origen manual del originado en búsqueda, y hacer que ambos entren al mismo flujo comercial, seguimiento y automatización.
5. Ajustar el módulo Leads una vez consolidada la entrada de contactos manuales.
6. Recién entonces construir campañas reales y reportes operativos más completos.

## Posterior

- Gestión real de fuentes y observabilidad de scrapers.
- Secuencias de campaña, integraciones de canal e inbox, si se validan como parte del producto.
- Configuración global y permisos administrativos.
- Alertas, monitoreo y analítica/exportaciones.

## Criterio de trabajo

Antes de marcar una iniciativa como hecha, contrastarla con el código, migraciones y validaciones. Mantener la separación: adquisición no es operación de lead; operaciones globales no deben desplazar el trabajo detallado que corresponde a `/leads`.
