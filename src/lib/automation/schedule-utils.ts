import type { AutomationSchedule } from "@/components/leads-panel/types";

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getAutomationScheduleIntervalMinutes(
  schedule: Pick<AutomationSchedule, "runEveryMinutes">
) {
  return Math.max(1, Math.floor(schedule.runEveryMinutes || 0));
}

export function getAutomationScheduleIntervalLabel(
  schedule: Pick<AutomationSchedule, "runEveryMinutes">
) {
  const minutes = getAutomationScheduleIntervalMinutes(schedule);

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "Cada 1 hora" : `Cada ${hours} horas`;
  }

  return minutes === 1 ? "Cada 1 minuto" : `Cada ${minutes} minutos`;
}

export function getAutomationScheduleNextRunAt(
  schedule: Pick<AutomationSchedule, "isEnabled" | "lastRunAt" | "runEveryMinutes">,
  now = new Date()
) {
  if (!schedule.isEnabled) {
    return null;
  }

  const lastRunAt = toDate(schedule.lastRunAt);

  if (!lastRunAt) {
    return new Date(now.getTime());
  }

  return new Date(
    lastRunAt.getTime() +
      getAutomationScheduleIntervalMinutes(schedule) * 60 * 1000
  );
}

export function isAutomationScheduleDue(
  schedule: Pick<AutomationSchedule, "isEnabled" | "lastRunAt" | "runEveryMinutes">,
  now = new Date()
) {
  if (!schedule.isEnabled) {
    return false;
  }

  const nextRunAt = getAutomationScheduleNextRunAt(schedule, now);

  if (!nextRunAt) {
    return false;
  }

  return nextRunAt.getTime() <= now.getTime();
}

function parseTimeValue(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) {
    return null;
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    totalMinutes: Number(match[1]) * 60 + Number(match[2]),
  };
}

export function isValidAutomationScheduleTimeValue(value: string) {
  return parseTimeValue(value) !== null;
}

function getTimeZoneParts(
  timezone: string,
  now = new Date()
) {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minutePart = parts.find((part) => part.type === "minute")?.value ?? "00";

    return {
      hours: Number(hourPart),
      minutes: Number(minutePart),
      totalMinutes: Number(hourPart) * 60 + Number(minutePart),
    };
  } catch {
    return null;
  }
}

export function isValidAutomationScheduleTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
    }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getAutomationScheduleMaxItemsPerRun(
  schedule: Pick<AutomationSchedule, "maxItemsPerRun">
) {
  return Math.max(1, Math.floor(schedule.maxItemsPerRun || 0));
}

export function isAutomationScheduleWithinRunWindow(
  schedule: Pick<
    AutomationSchedule,
    "respectQuietHours" | "runWindowStart" | "runWindowEnd" | "timezone"
  >,
  now = new Date()
) {
  if (!schedule.respectQuietHours) {
    return true;
  }

  const start = parseTimeValue(schedule.runWindowStart);
  const end = parseTimeValue(schedule.runWindowEnd);
  const current = getTimeZoneParts(schedule.timezone, now);

  if (!start || !end || !current) {
    return false;
  }

  if (start.totalMinutes === end.totalMinutes) {
    return true;
  }

  if (start.totalMinutes < end.totalMinutes) {
    return (
      current.totalMinutes >= start.totalMinutes &&
      current.totalMinutes < end.totalMinutes
    );
  }

  return (
    current.totalMinutes >= start.totalMinutes ||
    current.totalMinutes < end.totalMinutes
  );
}

export function getAutomationScheduleRunWindowLabel(
  schedule: Pick<
    AutomationSchedule,
    "respectQuietHours" | "runWindowStart" | "runWindowEnd" | "timezone"
  >
) {
  if (!schedule.respectQuietHours) {
    return "Sin ventana horaria";
  }

  return `${schedule.runWindowStart}-${schedule.runWindowEnd} (${schedule.timezone})`;
}
