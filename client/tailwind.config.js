/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#00A8E8",
          500: "#00A8E8",
          600: "#0089BE",
          700: "#006A94",
          800: "#004B6A",
          900: "#0B2D5C",
        },
      },
    },
  },
  plugins: [],
};
