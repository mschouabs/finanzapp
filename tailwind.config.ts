import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Superficies
        page: "var(--bg-page)",
        card: "var(--bg-card)",
        field: "var(--bg-input)",
        alternate: "var(--bg-alternate)",
        // Texto
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        // Bordes como color, para no chocar con la utilidad `border`
        line: "var(--border-color)",
        "line-subtle": "var(--border-subtle)",
        // Acentos
        positive: "var(--accent-positive)",
        negative: "var(--accent-negative)",
        confirm: "var(--accent-confirm)",
        "confirm-hover": "var(--accent-confirm-hover)",
        info: "var(--accent-secondary)",
      },
      borderColor: {
        DEFAULT: "var(--border-color)",
        subtle: "var(--border-subtle)",
      },
      borderRadius: {
        card: "var(--radius)",
      },
      boxShadow: {
        card: "var(--shadow)",
        "card-hover": "var(--shadow-hover)",
      },
      fontFamily: {
        mono: ["'Courier New'", "Courier", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
