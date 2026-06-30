type DemoResetOptions = {
  force?: boolean;
  reason?: string;
  resetIntervalMinutes?: number;
  activeSessionWindowMinutes?: number;
};

type DemoResetResult = {
  ok: boolean;
  resetPerformed: boolean;
  reason: string;
  activeSessions: number;
  lastResetAt: string | null;
};

function isTrueEnvFlag(value: string | undefined) {
  return value === "true";
}

async function loadSeedModule() {
  return import("../../../prisma/seed.mjs");
}

export function isDemoMaybeResetOnLoginEnabled() {
  return (
    isTrueEnvFlag(process.env.DEMO_MAYBE_RESET_ON_LOGIN) ||
    isTrueEnvFlag(process.env.DEMO_AUTO_RESET_ON_LOGIN)
  );
}

export async function maybeResetDemoData(
  options: DemoResetOptions = {},
): Promise<DemoResetResult> {
  const seedModule = await loadSeedModule();
  return seedModule.resetDemoData(options);
}

export async function forceResetDemoData(reason = "manual"): Promise<DemoResetResult> {
  return maybeResetDemoData({ force: true, reason });
}
