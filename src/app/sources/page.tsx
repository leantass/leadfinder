import { AppShell } from "@/components/app-shell";
import { ModuleFoundation } from "@/components/module-foundation";
import { getWorkspaceShellData } from "@/lib/workspace-data";

export default async function SourcesPage() {
  const shellData = await getWorkspaceShellData();

  return (
    <AppShell
      metrics={[
        {
          label: "Fuente activa",
          value: "Google Maps",
          helper: "Origen actual de adquisicion ya conectado al sistema.",
        },
        {
          label: "Busquedas ejecutadas",
          value: String(shellData.counts.searchJobCount),
          helper: "Volumen historico ya persistido desde la fuente actual.",
        },
        {
          label: "Leads captados",
          value: String(shellData.counts.leadCount),
          tone: "info",
          helper: "Base disponible originada desde las fuentes conectadas.",
        },
      ]}
      title="Fuentes"
      description="Mapa modular de origenes de datos del producto, separado del resto de la operacion."
      primaryAction={{
        label: "Ir a Busquedas",
        href: "/searches",
      }}
      contextPanel={{
        eyebrow: "Origen de datos",
        title: "Gobierno de fuentes",
        description:
          "Este modulo va a concentrar que entradas existen, su estado, cobertura y prioridad dentro del sistema.",
        footer:
          "Todavia no se agregan mas fuentes, pero la plataforma ya tiene el lugar correcto para hacerlo.",
      }}
    >
      <ModuleFoundation
        title="Fuentes de captura"
        description="Esta seccion define desde donde entra la informacion al producto. Su objetivo es separar la estrategia de origen de datos del modulo operativo de Busquedas y del pipeline comercial."
        highlights={[
          {
            label: "Cobertura actual",
            value: "1 fuente conectada",
            detail: "La base hoy parte de Google Maps y ya alimenta jobs reales.",
          },
          {
            label: "Responsabilidad",
            value: "Origen y calidad",
            detail: "Aca va a vivir la lectura sobre confiabilidad, cobertura y expansion.",
          },
          {
            label: "Proximo uso",
            value: "Escalar adquisicion",
            detail: "Base lista para sumar nuevas fuentes sin mezclar capas.",
          },
        ]}
        sections={[
          {
            title: "Que va a vivir aca",
            description:
              "El modulo queda reservado para catalogar fuentes, su estado de integracion y su aporte al pipeline.",
            items: [
              "Inventario de fuentes activas, en prueba o pausadas.",
              "Descripcion del tipo de dato que aporta cada fuente.",
              "Lectura corta de confiabilidad y cobertura antes de escalar captacion.",
            ],
          },
          {
            title: "Estado actual",
            description:
              "La plataforma ya reconoce que adquisicion y origen de datos no son lo mismo.",
            items: [
              "Google Maps es la fuente operativa actual del sistema.",
              "Busquedas sigue siendo el modulo para ejecutar jobs sobre esa fuente.",
              "La separacion deja listo el producto para crecer sin rearmar navegacion ni arquitectura.",
            ],
          },
        ]}
      />
    </AppShell>
  );
}
