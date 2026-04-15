import { AppShell } from "@/components/app-shell";
import { ModuleFoundation } from "@/components/module-foundation";
import { getWorkspaceShellData } from "@/lib/workspace-data";

export default async function CampaignsPage() {
  const shellData = await getWorkspaceShellData();

  return (
    <AppShell
      metrics={[
        {
          label: "Listos para outreach",
          value: String(shellData.counts.automationReadyLeadsCount),
          helper: "Base potencial para futuras campanas supervisadas.",
        },
        {
          label: "WhatsApp sugerido",
          value: String(shellData.counts.whatsappOutreachLeadsCount),
          tone: "info",
          helper: "Leads donde el canal ya aparece como mas natural.",
        },
        {
          label: "Estado del modulo",
          value: "Base inicial",
          helper: "Separado del pipeline sin activar todavia logica profunda.",
        },
      ]}
      title="Campanas"
      description="Base modular para el futuro de outreach coordinado, separada de Leads y Operaciones."
      primaryAction={{
        label: "Ir a Operaciones",
        href: "/operations",
      }}
      contextPanel={{
        eyebrow: "Orquestacion comercial",
        title: "Campanas aun no activas",
        description:
          "Este modulo deja su lugar claro dentro del producto sin adelantar automatizaciones de campana que todavia no corresponden.",
        footer:
          "La plataforma ya puede crecer hacia outreach coordinado sin volver a mezclar estrategia, ejecucion y lectura por lead.",
      }}
    >
      <ModuleFoundation
        title="Campanas y secuencias"
        description="La funcion de esta seccion es alojar el futuro trabajo de outreach orquestado. En este paso solo se define su espacio y su proposito, sin activar nuevas reglas de negocio."
        highlights={[
          {
            label: "Separacion lograda",
            value: "Estrategia != operacion",
            detail: "Leads opera registros. Operaciones automatiza runs. Campanas quedara para outreach coordinado.",
          },
          {
            label: "Base disponible",
            value: "Leads candidatos",
            detail: "Ya existe un conjunto de leads listos para futuras secuencias.",
          },
          {
            label: "Siguiente etapa",
            value: "Diseno de flujos",
            detail: "El modulo queda listo para crecer despues sin tocar arquitectura.",
          },
        ]}
        sections={[
          {
            title: "Que va a vivir aca",
            description:
              "Campanas sera el lugar para coordinar mensajes, lotes, estados de outreach y lectura de performance.",
            items: [
              "Definicion de lotes y secuencias de contacto.",
              "Lectura de performance por campana y por canal.",
              "Separacion clara entre estrategia de outreach y trabajo individual por lead.",
            ],
          },
          {
            title: "Que no se hace aun",
            description:
              "La pagina base es deliberadamente prudente para no adelantar features no pedidas.",
            items: [
              "No hay envio automatico ni secuencias multi step todavia.",
              "No hay inbox ni orquestador de campanas en este paso.",
              "Solo queda el modulo preparado para la siguiente fase del producto.",
            ],
          },
        ]}
      />
    </AppShell>
  );
}
