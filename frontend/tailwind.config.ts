import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#06090F",
          900: "#0A0F18",
          850: "#0D1420",
          800: "#111A2A",
          700: "#1A2538",
          600: "#27364E",
        },
        accent: {
          DEFAULT: "#3DDC84",
          dim: "#22A35F",
          faint: "#123B28",
        },
        warn: "#F5B544",
        danger: "#F26D6D",
        muted: "#8B98AD",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        display: ["var(--font-newsreader)", "Georgia", "serif"],
        plex: ["var(--font-plex)", "ui-monospace", "monospace"],
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        flowLine: {
          "0%": { width: "0%" },
          "100%": { width: "100%" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.4s ease-in-out infinite",
        fadeUp: "fadeUp 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
