/**
 * Fallback handler when static assets do not match the request.
 * Most traffic is served from the bound assets directory.
 */
export default {
  async fetch(request, env) {
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
};
