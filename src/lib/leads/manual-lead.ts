export type ManualLeadInput = {
  businessName?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  category?: string | null;
};

export type ManualLeadFieldErrors = Partial<
  Record<keyof ManualLeadInput, string>
>;

export type NormalizedManualLeadInput = {
  businessName: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  category: string | null;
};

export type ManualLeadValidationResult =
  | {
      ok: true;
      data: NormalizedManualLeadInput;
      fieldErrors: ManualLeadFieldErrors;
    }
  | {
      ok: false;
      data: null;
      fieldErrors: ManualLeadFieldErrors;
    };

function normalizeOptionalString(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized === "" ? null : normalized;
}

function normalizePhone(value: string | null) {
  if (!value) {
    return {
      value: null,
      error: null,
    };
  }

  if (!/^\+?[0-9\s()-]+$/.test(value)) {
    return {
      value: null,
      error:
        "El teléfono solo puede contener números, espacios, +, -, y paréntesis.",
    };
  }

  const digitCount = (value.match(/\d/g) ?? []).length;

  if (digitCount < 6 || digitCount > 15) {
    return {
      value: null,
      error: "El teléfono debe contener entre 6 y 15 dígitos.",
    };
  }

  return {
    value,
    error: null,
  };
}

function normalizeWebsite(value: string | null) {
  if (!value) {
    return {
      value: null,
      error: null,
    };
  }

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;

  try {
    const url = new URL(candidate);

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname.includes(".") ||
      url.username !== "" ||
      url.password !== ""
    ) {
      throw new Error("Invalid website URL");
    }

    return {
      value: url.toString(),
      error: null,
    };
  } catch {
    return {
      value: null,
      error: "Ingresá una URL válida, por ejemplo ejemplo.com.",
    };
  }
}

export function validateManualLeadInput(
  input: ManualLeadInput
): ManualLeadValidationResult {
  const fieldErrors: ManualLeadFieldErrors = {};
  const businessName = normalizeOptionalString(input.businessName) ?? "";
  const rawPhone = normalizeOptionalString(input.phone);
  const rawWebsite = normalizeOptionalString(input.website);
  const phone = normalizePhone(rawPhone);
  const website = normalizeWebsite(rawWebsite);

  if (!businessName) {
    fieldErrors.businessName = "El nombre del negocio es obligatorio.";
  }

  if (phone.error) {
    fieldErrors.phone = phone.error;
  }

  if (website.error) {
    fieldErrors.website = website.error;
  }

  if (!rawPhone && !rawWebsite) {
    const contactError = "Ingresá al menos un teléfono o un sitio web.";
    fieldErrors.phone = contactError;
    fieldErrors.website = contactError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      data: null,
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      businessName,
      phone: phone.value,
      website: website.value,
      address: normalizeOptionalString(input.address),
      city: normalizeOptionalString(input.city),
      category: normalizeOptionalString(input.category),
    },
    fieldErrors,
  };
}
