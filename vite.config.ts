import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "client",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    middlewareMode: false,
    fs: { strict: false },
    // Vite's default host-header check blocks DNS-rebinding by rejecting any
    // request whose Host header isn't localhost. Production-style access via
    // the public domain (adv-generator.acentecom.com) needs to be allowed.
    // We list the public hostnames explicitly; localhost variants stay on by
    // default for local dev. `.acentecom.com` covers future subdomains.
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "adv-generator.acentecom.com",
      ".acentecom.com",
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true,
  },
});
