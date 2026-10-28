// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// The deploy workflow passes these from actions/configure-pages, so the build matches where
// GitHub actually serves the site: https://wsa-reservation.mteke.com (custom domain) or
// https://melihteke.github.io/wsa-reservation (before the custom domain is configured).
const site = process.env.SITE_ORIGIN || "https://wsa-reservation.mteke.com";
const base = process.env.SITE_BASE_PATH || "/";

export default defineConfig({
  site,
  base,
  trailingSlash: "ignore",
  integrations: [react(), sitemap({ filter: (page) => !/\/(admin|auth|my|pending|reserve)\b/.test(page) })],
  vite: {
    plugins: [tailwindcss()],
  },
});
