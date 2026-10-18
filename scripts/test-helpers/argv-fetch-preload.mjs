import { bootstrapStandInFetch } from "./fetch-stub.mjs";

/**
 * Preloaded with `node --import` in the argv tests so the real deploy scripts run
 * end to end without any network access. Answers the Worker deployment calls here
 * and hands every bootstrap preflight call to the shared stand-in.
 */

const bootstrap = bootstrapStandInFetch();

const ok = (result) =>
  new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method ?? "GET";
  if (u.includes("/workers/scripts/") && u.includes("/deployments")) {
    if (method === "POST") {
      return ok({ id: "deployment-from-argv-test" });
    }
    return ok({
      deployments: [
        { id: "dep-1", versions: [{ version_id: "11111111-2222-3333-4444-555555555555", percentage: 100 }] },
      ],
    });
  }
  if (/api\.github\.com\/users\/[^/]+$/.test(u)) {
    return new Response(JSON.stringify({ id: 4242, login: u.split("/").pop() }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return bootstrap(url, init);
};
