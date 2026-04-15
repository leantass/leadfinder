import { AppShell } from "@/components/app-shell";
import { ModuleFoundation } from "@/components/module-foundation";
import { getWorkspaceShellData } from "@/lib/workspace-data";

export default async function ScrapersPage() {
  const shellData = await getWorkspaceShellData();

  return (
    <AppShell
      metrics={[
        {
          label: "Scraper operativo",
          value: "Google Maps job",
          helper: "Flujo actual de captura ejecutable desde Busquedas.",
        },
        {
          label: "Jobs historicos",
          value: String(shellData.counts.searchJobCount),
          helper: "Ejecuciones ya persistidas en la base del producto.",
        },
        {
          label: "Leads generados",
          value: String(shellData.counts.leadCount),
          tone: "info",
          helper: "Resultado acumulado del scraper activo.",
        },
      ]}
      title="Scrapers"
      description="Base del modulo tecnico de captura, separada de la experiencia operativa del usuario."
      primaryAction={{
        label: "Ir a Busquedas",
        href: "/searches",
      }}
      contextPanel={{
        eyebrow: "Capa tecnica",
        title: "Motor de scraping",
        description:
          "Aca va a quedar la lectura tecnica de ejecucion, estabilidad y control de scrapers sin mezclarla con la operacion comercial.",
        footer:
          "El objetivo es que Busquedas use scrapers. No que tenga que explicarlos.",
      }}
    >
      <ModuleFoundation
        title="Scrapers y jobs tecnicos"
        description="Este modulo deja reservado el lugar de la capa tecnica de extraccion. Su foco futuro es el estado de los scrapers, su estabilidad y su capacidad operativa."
        highlights={[
          {
            label: "Modulo separado",
            value: "Si",
            detail: "La arquitectura ya distingue captura tecnica de uso funcional.",
          },
          {
            label: "Lectura futura",
            value: "Salud del scraper",
            detail: "Aqui va a vivir la trazabilidad tecnica de ejecucion.",
          },
          {
            label: "Uso del negocio",
            value: "Indirecto",
            detail: "El negocio usa Busquedas; el equipo usa Scrapers para observar la maquinaria.",
          },
        ]}
        sections={[
          {
            title: "Proposito del modulo",
            description:
              "No esta pensado para operar leads sino para entender y controlar la captura tecnica.",
            items: [
              "Estado del scraper por fuente y por job.",
              "Capacidad, errores y estabilidad de extraccion.",
              "Puente limpio entre infraestructura de captura y modulo de Busquedas.",
            ],
          },
          {
            title: "Estado inicial serio",
            description:
              "La base queda lista sin meter aun dashboards tecnicos complejos ni nuevas integraciones.",
            items: [
              "El flujo real actual depende del job de Google Maps.",
              "Los jobs se siguen lanzando desde Busquedas para no romper UX.",
              "Scrapers queda listo para absorber observabilidad tecnica despues.",
            ],
          },
        ]}
      />
    </AppShell>
  );
}
