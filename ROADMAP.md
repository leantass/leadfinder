# Roadmap LeadFinder

## Estado actual
LeadFinder ya tiene base modular, persistencia real y automatización supervisada funcionando.

## Hecho
- Estructura modular de rutas:
  - Dashboard
  - Búsquedas
  - Leads
  - Operaciones
  - Fuentes
  - Scrapers
  - Campañas
  - Reportes
  - Configuración
- Persistencia de:
  - leads
  - notas
  - seguimiento
  - historial operativo
- Runs automáticos persistidos
- Schedules persistidos
- Autoaplicación configurable por schedule
- Runner protegido por secret
- Cron listo para uso externo
- Locking e idempotencia para evitar duplicados
- Quiet hours y límite de items por corrida
- Validación funcional real de flujos principales
- Ajustes visuales base en operaciones
- Proyecto subido a GitHub

## En progreso
- Reorganización visual y modular de toda la plataforma
- Limpieza de secciones para que cada módulo tenga su lugar real

## Próximo paso
- Separar mejor las secciones de la plataforma y dejar cada módulo con identidad propia
- Reducir el Dashboard a foco ejecutivo y acciones realmente útiles
- Evitar repetir métricas genéricas en todas las pantallas

## Próximos módulos importantes
- Contactos / carga manual de teléfonos
- Ingreso manual de listas de WhatsApp
- Entrada de contactos manuales al flujo común de seguimiento y automatización

## Después
- Campañas reales
- Reportes operativos más completos
- Configuración avanzada
- Importación CSV
- Alertas y monitoreo
- Mejora progresiva de cada módulo

## Regla de trabajo
Avanzar por pasos cortos:
1. ordenar estructura
2. validar
3. recién después profundizar módulo por módulo