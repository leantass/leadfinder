import { AppShell } from "@/components/app-shell";
import { ModuleFoundation } from "@/components/module-foundation";
import {
  getDashboardSummaryData,
  getWorkspaceShellData,
} from "@/lib/workspace-data";

export default async function ReportsPage() {
  const [shellData, dashboardSummary] = await Promise.all([
    getWorkspaceShellData(),
    getDashboardSummaryData(),
  ]);

  return (
    <AppShell
      metrics={[
        {
          label: "Leads totales",
          value: String(shellData.counts.leadCount),
          helper: "Base actual ya disponible para lectura ejecutiva.",
        },
        {
          label: "Calificados",
          value: String(shellData.counts.qualifiedLeadsCount),
          tone: "success",
          helper: "Punto de partida para reportes comerciales mas finos.",
        },
        {
          label: "Urgentes",
          value: String(dashboardSummary.urgentLeadsCount),
          tone: "warning",
          helper: "Carga prioritaria visible hoy en el sistema.",
        },
      ]}
      title="Reportes"
      description="Base del modulo de lectura ejecutiva y analitica, separado del dashboard operativo."
      primaryAction={{
        label: "Volver al Dashboard",
        href: "/",
      }}
      contextPanel={{
        eyebrow: "Lectura ejecutiva",
        title: "Reportes del producto",
        description:
          "El dashboard queda como punto de arranque corto. Reportes sera el lugar de analisis, comparacion y lectura de tendencia.",
        footer:
          "Esta separacion evita que el dashboard vuelva a crecer hasta convertirse en una pantalla gigante.",
      }}
    >
      <ModuleFoundation
        title="Analitica y visibilidad"
        description="Reportes queda reservado para profundizar lectura de volumen, calidad, conversion y productividad sin contaminar la experiencia diaria del operador."
        highlights={[
          {
            label: "Tipo de modulo",
            value: "Lectura",
            detail: "Aca se miran tendencias y resumenes, no se opera lead por lead.",
          },
          {
            label: "Base actual",
            value: "Datos reales",
            detail: "La plataforma ya tiene suficiente informacion persistida para empezar a reportar despues.",
          },
          {
            label: "Beneficio",
            value: "Dashboard mas liviano",
            detail: "Se evita mezclar control diario con analitica profunda.",
          },
        ]}
        sections={[
          {
            title: "Para que sirve esta seccion",
            description:
              "El modulo esta preparado para alojar paneles ejecutivos, comparativas y reportes de operacion cuando llegue el momento.",
            items: [
              "Lectura de volumen y calidad por fuente, busqueda y periodo.",
              "Tendencias de pipeline, seguimiento y automatizacion.",
              "Resumenes exportables o compartibles sin tocar la capa operativa.",
            ],
          },
          {
            title: "Base actual",
            description:
              "Ya hay indicadores suficientes para justificar que esta area exista aunque todavia este en etapa inicial.",
            items: [
              `${shellData.counts.leadCount} leads ya estan persistidos en la base actual.`,
              `${shellData.counts.qualifiedLeadsCount} ya tienen criterio comercial para avanzar.`,
              `${dashboardSummary.urgentLeadsCount} hoy aparecen como foco inmediato dentro del sistema.`,
            ],
          },
        ]}
      />
    </AppShell>
  );
}
