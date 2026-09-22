import { AppShell } from "@/components/app-shell";
import { ContactsEntryPanel } from "@/components/contacts-entry-panel";

export default function ContactsPage() {
  return (
    <AppShell
      title="Contactos"
      description="Incorporá oportunidades manuales al mismo proceso comercial de LeadFinder."
      primaryAction={{ label: "Abrir Leads", href: "/leads" }}
      metrics={[
        { label: "Entrada", value: "Manual", helper: "Individual o lista" },
        { label: "Destino", value: "Leads", tone: "info", helper: "Proceso comercial unificado" },
        { label: "Trazabilidad", value: "Activa", tone: "success", helper: "Actividad de creación" },
      ]}
      contextPanel={{
        eyebrow: "Flujo unificado",
        title: "Contacto → Lead",
        description: "La carga manual es un origen de adquisición. No crea un CRM paralelo: el contacto continúa en Leads con el mismo seguimiento y automatización.",
        footer: "Pegá hasta 100 contactos y revisá los datos antes de incorporarlos.",
      }}
    >
      <div className="max-w-4xl">
        <ContactsEntryPanel />
      </div>
    </AppShell>
  );
}
