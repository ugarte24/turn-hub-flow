// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/** En dev, /legacy cae en el 404 del SPA; el panel vive en /legacy/index.html */
function legacyPanelRedirect(): Plugin {
  return {
    name: "sigat-legacy-panel-redirect",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || "").split("?")[0];
        if (path === "/legacy" || path === "/legacy/") {
          res.statusCode = 302;
          res.setHeader("Location", "/legacy/index.html");
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Chrome 109 = último Chrome de Windows 7. Sin esto el panel suele romperse tras el login.
  vite: {
    plugins: [legacyPanelRedirect()],
    build: {
      target: ["chrome109", "firefox115", "safari15"],
      cssTarget: "chrome109",
    },
    esbuild: {
      target: "chrome109",
    },
  },
});
