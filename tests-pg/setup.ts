import { vi } from "vitest";
import { signedIn } from "./session";

/**
 * Stand in for the Next.js request around a server action: who is signed in,
 * cookies and headers, cache revalidation, and `after()`. Everything the
 * action then does - the schema, the rules, the store, the SQL - is real.
 *
 * `after()` is run **immediately** rather than dropped, so the mail
 * dispatch that follows a notification happens inside the test; the
 * transport is the dry run (`MAIL_DRY_RUN` in `vitest.pg.config.ts`).
 */
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCurrentUser: async () => signedIn(),
  requireUser: async () => {
    const user = signedIn();
    if (!user) throw new Error("Not signed in");
    return user;
  },
}));
vi.mock("@/lib/revalidate", () => ({ revalidateBookings: () => {} }));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "test-pg", "x-forwarded-for": "127.0.0.1" }),
  cookies: async () => {
    const jar = new Map<string, string>();
    return {
      get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
      set: (k: string, v: string) => void jar.set(k, v),
      delete: (k: string) => void jar.delete(k),
      has: (k: string) => jar.has(k),
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    };
  },
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (task: unknown) => {
    if (typeof task === "function") void Promise.resolve().then(task as () => unknown).catch(() => {});
  },
}));
