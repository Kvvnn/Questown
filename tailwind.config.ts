import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        quest: {
          sky: "#e6f7ff",
          grass: "#c7f9cc",
          primary: "#4c6fff",
          accent: "#ffb703",
          success: "#2ecc71",
          danger: "#ef476f"
        }
      },
      boxShadow: {
        bubbly: "0 8px 0 rgba(0,0,0,0.08)"
      }
    }
  },
  plugins: []
};

export default config;
