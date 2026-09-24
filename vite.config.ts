import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  server: {
    host: true, // Listen on all local IPs
  },
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      // Split every route's component into its own chunk, fetched when that
      // route is first visited.
      //
      // Without this the generated route tree statically imports all 55 route
      // modules, so everything landed in one 1.2 MB entry chunk: an employee
      // whose whole job is tapping Punch In downloaded the admin panel, the
      // super-admin console and every report screen first.
      //
      // Done with the plugin's own flag rather than by hand-writing 55
      // `.lazy.tsx` files. Same result, and it cannot drift out of sync with
      // the route definitions the way a hand-split tree does.
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.png", "favicon.svg"],
      devOptions: {
        enabled: true,
      },
      workbox: {
        // Increase max file size limit to 5 MB so precaching won't fail on large bundles
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: [
          "**/*.{css,html,ico,png,svg,woff,woff2}",
          "assets/index-*.js",
          // vendor-react-*.js / vendor-tanstack-*.js only exist after the
          // manualChunks build step below runs (a production-only Rollup
          // option). Dev mode serves modules unbundled, so listing them
          // unconditionally made every `npm run dev` log a harmless workbox
          // "glob pattern doesn't match any files" warning.
          ...(command === "build" ? ["assets/vendor-react-*.js", "assets/vendor-tanstack-*.js"] : []),
        ],
        // Precache the SHELL, not the whole app.
        //
        // Every JS file used to be precached, so a first visit downloaded ~3.8
        // MB before anything was usable — the Excel library, the map library
        // and every admin screen included, for an employee who only punches in.
        // It also silently defeated the dynamic import of xlsx: the code never
        // executed, but the bytes were fetched anyway.
        //
        // Route chunks are content-hashed and immutable, so CacheFirst below
        // keeps them permanently after their first use. The trade is that a
        // route never visited before is unavailable offline — which costs
        // nothing real, because every screen in this app renders from an API
        // call that would fail offline regardless.
        globIgnores: [
          "**/node_modules/**",
          "**/sw.js",
          "**/workbox-*.js",
          // 532 KB of decorative login background — larger than the app's own
          // entry chunk. A returning user goes straight to their dashboard and
          // never sees it, so precaching made every one of them pay for an
          // image they will not look at. It still loads normally with the login
          // route, and is cached by the asset rule below afterwards.
          //
          // It should also simply be smaller: re-exported as WebP at the size
          // it is actually displayed, it would be well under 100 KB.
          "assets/login-bg-*.png",
          // A QA fixture that has no business in a production precache.
          "__qa-super-session.html",
        ],
        // Take over open pages immediately on a new deploy and purge stale
        // precaches — prevents an old service worker from serving a broken
        // cached bundle (e.g. one pointing at the wrong API URL).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Route chunks and the heavy vendors, cached on first use.
            //
            // CacheFirst is correct here specifically because these filenames
            // are content-hashed: a changed file is a different URL, so a
            // cached entry can never be stale. A new deploy simply requests
            // new names.
            urlPattern: ({ url, request }) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith("/assets/") &&
              (request.destination === "script" ||
                request.destination === "style" ||
                request.destination === "image" ||
                request.destination === "font"),
            handler: "CacheFirst",
            options: {
              cacheName: "app-chunks",
              expiration: {
                // Comfortably more than one deploy's worth of chunks, so the
                // previous build survives alongside the new one and a page
                // open across a deploy can still fetch what it references.
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache CARTO / OpenStreetMap map tiles with a network-first strategy
            urlPattern: /^https:\/\/(?:[a-z]\.)?basemaps\.cartocdn\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "map-tiles",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        name: "B.O.T HRMS Admin",
        short_name: "B.O.T",
        description: "Premium HRMS dashboard for the B.O.T workforce.",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "/favicon.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@vitejs/plugin-react", "@tailwindcss/oxide"],
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react";
            }
            if (id.includes("@tanstack")) {
              return "vendor-tanstack";
            }
            if (id.includes("recharts") || id.includes("framer-motion") || id.includes("lucide-react")) {
              return "vendor-ui";
            }
            if (id.includes("leaflet")) {
              return "vendor-maps";
            }
            if (id.includes("xlsx")) {
              return "vendor-xlsx";
            }
          }
        },
      },
    },
  },
}));
