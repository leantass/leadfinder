import { calculateLeadScore } from "./lead-score";
import { classifyWebsiteType } from "./website-type";
import type { WebsiteType } from "./website-type";

export type CommercialClassification = {
  businessType: string;
  suggestedOffer: string;
  offerReason: string;
  readyForAutomation: boolean;
  outreachStatus: string;
  outreachChannel: string;
};

export type LeadCommercialInput = {
  query: string;
  businessName?: string | null;
  category?: string | null;
  website?: string | null;
  phone?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
};

export type EnrichedLeadCommercialData = {
  websiteType: WebsiteType;
  score: number;
  scoreReasons: string[];
  businessType: string;
  suggestedOffer: string;
  offerReason: string;
  readyForAutomation: boolean;
  outreachStatus: string;
  outreachChannel: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function detectBusinessType(input: {
  query: string;
  businessName?: string | null;
  category?: string | null;
  website?: string | null;
}) {
  const haystack = [
    normalizeText(input.query),
    normalizeText(input.businessName),
    normalizeText(input.category),
    normalizeText(input.website),
  ]
    .join(" ")
    .trim();

  if (
    /librer|papeler|regaler|jugueter|tienda|local|boutique|indumentaria|ropa|zapater|perfumer|farmacia|dietetic|pet shop|veterinaria|ferreter|kiosco|almacen|supermerc|autoservicio|muebler|deco|electro|celular|tecnolog|hogar/.test(
      haystack
    )
  ) {
    return "retail";
  }

  if (
    /restaurant|resto|bar|cafe|cafeter|pizzer|helader|hamburgues|parrill|comida|gastro|pasteler|panader|cervecer/.test(
      haystack
    )
  ) {
    return "gastronomia";
  }

  if (
    /peluquer|barber|belleza|spa|estetica|cosmetic|uñas|unas|salon/.test(
      haystack
    )
  ) {
    return "belleza";
  }

  if (
    /hotel|hostel|turismo|apart|viajes|travel|inmobiliaria|real estate|propiedad/.test(
      haystack
    )
  ) {
    return "servicios_locales";
  }

  if (
    /estudio|abogado|contador|consultor|asesor|arquitect|ingenier|medico|odontolog|psicolog|consultora|rrhh|marketing|agencia/.test(
      haystack
    )
  ) {
    return "servicios_profesionales";
  }

  if (
    /software|startup|saas|app|tecnolog|it|infraestructura|cloud|hosting|servidor|datacenter|devops|microservicios|backend/.test(
      haystack
    )
  ) {
    return "empresa_tecnologica";
  }

  if (
    /fabrica|industria|metalurg|logistica|distribuid|mayorista|constructora|transporte|import|export/.test(
      haystack
    )
  ) {
    return "empresa_operativa";
  }

  return "pyme_general";
}

function hasCommercialWebsite(
  website: string | null | undefined,
  websiteType: WebsiteType
) {
  return !!website && website.trim() !== "" && websiteType === "real";
}

function buildCommercialClassification(input: {
  query: string;
  businessName?: string | null;
  category?: string | null;
  website?: string | null;
  websiteType: WebsiteType;
  phone?: string | null;
  score: number;
}): CommercialClassification {
  const businessType = detectBusinessType(input);
  const hasWebsite = hasCommercialWebsite(input.website, input.websiteType);
  const hasPhone = !!input.phone && input.phone.trim() !== "";
  const highScore = input.score >= 80;
  const automationReady = hasPhone && input.score >= 50;

  if (businessType === "retail") {
    if (!hasWebsite) {
      return {
        businessType,
        suggestedOffer: "ecommerce_catalogo_estokia",
        offerReason:
          "Negocio retail sin web propia. Tiene potencial para ecommerce, catálogo online y mejora operativa con Estokia.",
        readyForAutomation: automationReady,
        outreachStatus: automationReady ? "qualified" : "pending_review",
        outreachChannel: hasPhone ? "whatsapp" : "manual_review",
      };
    }

    return {
      businessType,
      suggestedOffer: "estokia_automatizacion_comercial",
      offerReason:
        "Negocio retail con presencia digital propia. Puede necesitar control de stock, automatización administrativa y mejoras comerciales.",
      readyForAutomation: automationReady,
      outreachStatus: automationReady ? "qualified" : "pending_review",
      outreachChannel: hasPhone ? "whatsapp" : "manual_review",
    };
  }

  if (businessType === "gastronomia" || businessType === "belleza") {
    return {
      businessType,
      suggestedOffer: !hasWebsite
        ? "web_turnos_catalogo"
        : "automatizacion_marketing_ia",
      offerReason: !hasWebsite
        ? "Negocio local con necesidad clara de presencia digital propia, carta/catálogo, reservas o turnos."
        : "Negocio con presencia básica propia que puede mejorar captación, automatización y atención con IA.",
      readyForAutomation: automationReady,
      outreachStatus: automationReady ? "qualified" : "pending_review",
      outreachChannel: hasPhone ? "whatsapp" : "manual_review",
    };
  }

  if (businessType === "servicios_profesionales") {
    return {
      businessType,
      suggestedOffer: !hasWebsite
        ? "web_institucional_captacion"
        : "automatizacion_comercial_ia",
      offerReason: !hasWebsite
        ? "Servicio profesional sin web sólida propia. Puede captar mejor con presencia institucional y formularios."
        : "Servicio profesional con potencial para automatizar captación y seguimiento comercial.",
      readyForAutomation: automationReady,
      outreachStatus: automationReady ? "qualified" : "pending_review",
      outreachChannel: hasPhone ? "whatsapp" : "manual_review",
    };
  }

  if (businessType === "empresa_tecnologica") {
    return {
      businessType,
      suggestedOffer: highScore
        ? "synfive_infraestructura_y_backend"
        : "desarrollo_software_a_medida",
      offerReason: highScore
        ? "Empresa tecnológica con perfil compatible para infraestructura, nube privada, backend SaaS o servicios SynFive."
        : "Empresa tecnológica con potencial para desarrollo a medida, automatización o apoyo técnico especializado.",
      readyForAutomation: automationReady,
      outreachStatus: automationReady ? "qualified" : "pending_review",
      outreachChannel: hasPhone ? "whatsapp" : "manual_review",
    };
  }

  if (businessType === "empresa_operativa") {
    return {
      businessType,
      suggestedOffer: "estokia_automatizacion_operativa",
      offerReason:
        "Empresa operativa con potencial para ordenar stock, procesos, administración y trazabilidad con Estokia o software a medida.",
      readyForAutomation: automationReady,
      outreachStatus: automationReady ? "qualified" : "pending_review",
      outreachChannel: hasPhone ? "whatsapp" : "manual_review",
    };
  }

  if (businessType === "servicios_locales") {
    return {
      businessType,
      suggestedOffer: !hasWebsite
        ? "web_institucional_catalogo"
        : "automatizacion_atencion_y_leads",
      offerReason: !hasWebsite
        ? "Negocio de servicios locales sin presencia digital propia fuerte. Puede crecer con web institucional o catálogo."
        : "Negocio de servicios con base digital propia mejorable mediante automatización de consultas y captación.",
      readyForAutomation: automationReady,
      outreachStatus: automationReady ? "qualified" : "pending_review",
      outreachChannel: hasPhone ? "whatsapp" : "manual_review",
    };
  }

  return {
    businessType,
    suggestedOffer: !hasWebsite
      ? "web_presencia_digital"
      : "automatizacion_y_mejora_comercial",
    offerReason: !hasWebsite
      ? "PyME general sin web propia. Oportunidad clara para presencia digital, catálogo o captación online."
      : "PyME general con margen para automatización comercial, IA o mejora de procesos.",
    readyForAutomation: automationReady,
    outreachStatus: automationReady ? "qualified" : "pending_review",
    outreachChannel: hasPhone ? "whatsapp" : "manual_review",
  };
}

export function enrichLeadCommercialData(
  input: LeadCommercialInput
): EnrichedLeadCommercialData {
  const websiteType = classifyWebsiteType(input.website);

  const { score, reasons } = calculateLeadScore({
    phone: input.phone,
    website: input.website,
    websiteType,
    rating: input.rating,
    reviewsCount: input.reviewsCount,
  });

  const classification = buildCommercialClassification({
    query: input.query,
    businessName: input.businessName,
    category: input.category,
    website: input.website,
    websiteType,
    phone: input.phone,
    score,
  });

  return {
    websiteType,
    score,
    scoreReasons: reasons,
    businessType: classification.businessType,
    suggestedOffer: classification.suggestedOffer,
    offerReason: classification.offerReason,
    readyForAutomation: classification.readyForAutomation,
    outreachStatus: classification.outreachStatus,
    outreachChannel: classification.outreachChannel,
  };
}
