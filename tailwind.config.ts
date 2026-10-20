import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f1c1a",
        muted: "#6f6862",
        paper: "#f6f3ef",
        line: "#e9e3dc",
        brand: {
          DEFAULT: "#c81e3a",
          soft: "#ffe8ec",
          dark: "#a0102c",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(31,28,26,0.04), 0 12px 32px -12px rgba(31,28,26,0.16)",
        lift: "0 18px 50px -20px rgba(31,28,26,0.3)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "PingFang SC",
          "Microsoft YaHei",
          "Segoe UI",
          "sans-serif",
        ],
        display: ["Georgia", "Songti SC", "STSong", "serif"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-600px 0" },
          "100%": { backgroundPosition: "600px 0" },
        },
      },
      animation: {
        "fade-up": "fade-up .35s cubic-bezier(.22,1,.36,1) both",
        shimmer: "shimmer 1.6s infinite linear",
      },
    },
  },
  plugins: [],
};

export default config;
