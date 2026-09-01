import { AppShell } from "@/components/app-shell";
import { ManualContactForm } from "@/components/manual-contact-form";

export default function ContactsPage() {
  return (
    <AppShell
      title="Contactos"
      description="Incorporá oportunidades manuales al mismo pipeline comercial de LeadFinder."
      primaryAction={{ label: "Abrir Leads", href: "/leads" }}
      metrics={[
        { label: "Entrada", value: "Manual", helper: "Alta individual" },
        { label: "Destino", value: "Leads", tone: "info", helper: "Pipeline unificado" },
        { label: "Trazabilidad", value: "Activa", tone: "success", helper: "Actividad de creación" },
      ]}
      contextPanel={{
        eyebrow: "Flujo unificado",
        title: "Contacto → Lead",
        description: "La carga manual es un origen de adquisición. No crea un CRM paralelo: el contacto continúa en Leads con el mismo seguimiento y automatización.",
        footer: "Las importaciones masivas se incorporarán en una etapa posterior.",
      }}
    >
      <div className="max-w-4xl">
        <ManualContactForm />
      </div>
    </AppShell>
  );
}
