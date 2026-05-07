/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2f9df4",
        accent: "#78b900",
        success: "#1fb981",
        warning: "#c8a73a",
        danger: "#d95757",
        dark: {
          950: "#050607",
          900: "#0a0c0f",
          800: "#111418",
          700: "#181d22",
          600: "#252b31",
          500: "#343b43",
        },
      },
    },
  },
  plugins: [],
};
