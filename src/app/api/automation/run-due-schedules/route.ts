import { secretsEqual } from "@/lib/auth/crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { runDueAutomationSchedules } from "@/lib/automation/schedule-runner";

function revalidateAutomationWorkspacePaths() {
  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/operations");
}

function getRunnerSecretFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-automation-runner-secret");

  if (headerSecret && headerSecret.trim() !== "") {
    return headerSecret.trim();
  }

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return null;
}

function getUnauthorizedResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Unauthorized.",
    },
    {
      status: 401,
    }
  );
}

function validateRunnerSecret(request: Request) {
  const expectedSecret = process.env.AUTOMATION_RUNNER_SECRET?.trim();
  const providedSecret = getRunnerSecretFromRequest(request);

  if (!expectedSecret) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "AUTOMATION_RUNNER_SECRET no esta configurado.",
        },
        {
          status: 500,
        }
      ),
    };
  }

  if (!providedSecret || !secretsEqual(providedSecret, expectedSecret)) {
    return {
      ok: false as const,
      response: getUnauthorizedResponse(),
    };
  }

  return {
    ok: true as const,
  };
}

async function handleRunDueSchedules(request: Request) {
  const validation = validateRunnerSecret(request);

  if (!validation.ok) {
    return validation.response;
  }

  const result = await runDueAutomationSchedules();

  if (result.ok) {
    revalidateAutomationWorkspacePaths();
  }

  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
  });
}

export async function GET(request: Request) {
  return handleRunDueSchedules(request);
}

export async function POST(request: Request) {
  return handleRunDueSchedules(request);
}
