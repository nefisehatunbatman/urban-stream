/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#22c55e",
        accent: "#84cc16",
        success: "#1fb981",
        warning: "#c8a73a",
        danger: "#d95757",
        dark: {
          950: "#000000",
          900: "#000000",
          800: "#050505",
          700: "#0a0a0a",
          600: "#141414",
          500: "#1f1f1f",
        },
        slate: {
          900: "#0a0a0a",
          800: "#141414",
          700: "#1f1f1f",
          600: "#2a2a2a",
          500: "#6b7280",
          400: "#9ca3af",
          300: "#d1d5db",
        },
      },
    },
  },
  plugins: [],
};
