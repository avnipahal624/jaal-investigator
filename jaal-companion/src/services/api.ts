import { anyApi } from "convex/server";

/**
 * The typed Convex API surface for JAAL Companion.
 *
 * The type is derived from the generated API of the existing JAAL backend via
 * a type-only `import()` — so no backend source is ever bundled into the app.
 * The runtime value is Convex's `anyApi` proxy, which builds function-path
 * strings at call time (the same proxy the generated `api.js` exports), so the
 * app talks to the shared JAAL deployment without duplicating any backend.
 */
type GeneratedApi = typeof import("@convex-api").api;

export const api = anyApi as unknown as GeneratedApi;
