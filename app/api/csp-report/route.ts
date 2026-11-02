export const dynamic = "force-dynamic";

/**
 * CSP violation reports (SEC-10). Logs the violation server-side so
 * deployments can monitor injected content without exposing details to the
 * client. The endpoint accepts both `report-uri` (application/csp-report)
 * and `report-to` (application/reports+json) payloads.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    console.warn("[csp-violation]", JSON.stringify(body));
  } catch {
    // Malformed report — nothing to do.
  }
  return new Response(null, { status: 204 });
}
