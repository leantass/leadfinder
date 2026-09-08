import { AppShell } from "@/components/app-shell";
import { ModuleFoundation } from "@/components/module-foundation";
import {
  getAutomationSchedules,
  getLatestAutomationSchedulerExecution,
} from "@/lib/workspace-data";

export default async function SettingsPage() {
  const [schedules, latestSchedulerExecution] = await Promise.all([
    getAutomationSchedules(),
    getLatestAutomationSchedulerExecution(),
  ]);

  const activeSchedules = schedules.filter((schedule) => schedule.isEnabled).length;

  return (
    <AppShell
      metrics={[
        {
          label: "Schedules activos",
          value: String(activeSchedules),
          helper: "Configuracion operativa ya existente en la plataforma.",
        },
        {
          label: "Runner protegido",
          value: "Si",
          tone: "success",
          helper: "El endpoint due ya esta cubierto por secret y auditoria.",
        },
        {
          label: "Ultimo scheduler",
          value: latestSchedulerExecution ? latestSchedulerExecution.status : "Sin correr",
          helper: "Lectura corta del estado actual del runner programado.",
        },
      ]}
      title="Configuracion"
      description="Base del modulo de ajustes del sistema, separada de la operacion diaria."
      primaryAction={{
        label: "Ir a Operaciones",
        href: "/operations",
      }}
      contextPanel={{
        eyebrow: "Gobierno del sistema",
        title: "Configuracion central",
        description:
          "Este modulo queda reservado para politicas, parametros y ajustes del producto sin mezclarlos con la pantalla operativa.",
        footer:
          "La idea es que la configuracion del sistema viva aqui, aunque por ahora la interfaz siga siendo base inicial.",
      }}
    >
      <ModuleFoundation
        title="Ajustes y politicas"
        description="Configuracion queda como hogar natural de parametros globales, politicas del sistema y controles administrativos. En este paso se fija su lugar sin meter formularios profundos."
        highlights={[
          {
            label: "Politicas activas",
            value: `${activeSchedules} schedules`,
            detail: schedules.length ? "Configuraciones existentes del workspace." : "No hay schedules configurados. Esta vista no crea schedules.",
          },
          {
            label: "Seguridad",
            value: "Runner blindado",
            detail: "La ejecucion programada ya tiene proteccion y observabilidad.",
          },
          {
            label: "Escalabilidad",
            value: "Lista",
            detail: "El producto ya tiene donde alojar ajustes sin inflar otras pantallas.",
          },
        ]}
        sections={[
          {
            title: "Que va a vivir aca",
            description:
              "Este espacio queda preparado para configuracion del sistema y gobierno operativo.",
            items: [
              "Parametros globales de automatizacion y seguridad.",
              "Ajustes del workspace, politicas y defaults del producto.",
              "Configuracion de integraciones y comportamiento general del sistema.",
            ],
          },
          {
            title: "Estado actual",
            description:
              "Aunque no hay aun editor completo, la plataforma ya necesita un lugar legitimo para estos temas.",
            items: [
              "Los schedules ya son configurables desde Operaciones porque son parte del flujo vivo.",
              "La proteccion del runner y su observabilidad ya justifican un modulo de configuracion separado.",
              "La base queda lista para mover ajustes futuros sin tocar navegacion ni layout otra vez.",
            ],
          },
        ]}
      />
    </AppShell>
  );
}
