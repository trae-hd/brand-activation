import type { Config } from "tailwindcss";

// Content paths and plugins ONLY — no theme block.
// All design tokens live in app/globals.css under @theme inline (§3.3).
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  plugins: [],
};

export default config;
