import { assertEnv } from "@/lib/env";

/**
 * Runs once when the server starts (Next's instrumentation hook).
 *
 * The environment is checked here rather than lazily at the first request, so
 * a production deployment missing a secret — or with the developer sign-in
 * switch left on — fails to boot instead of running in a state nobody
 * intended. Outside production the same check only warns.
 */
export async function register(): Promise<void> {
  assertEnv();
}
