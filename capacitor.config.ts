import type { CapacitorConfig } from "@capacitor/cli";

// TIVO DEV AGENT — Capacitor config
// Works for both mobile (Android/iOS via `npx cap`) and web build.
// Hot-reload from Lovable sandbox is enabled by default; comment out
// `server.url` for production native builds.
const config: CapacitorConfig = {
  appId: "app.lovable.tivo.devagent",
  appName: "TIVO DEV AGENT",
  webDir: "dist",
  
  server: {
    // Lovable sandbox hot-reload (remove for production native build)
    url: "https://815047d2-18b4-41f5-9ab3-e2957e329b06.lovableproject.com?forceHideBadge=true",
    cleartext: true,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
