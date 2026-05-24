/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
  primary: {
    DEFAULT: "#005E50",
    light:   "#00876F",
    dark:    "#003D35",
    soft:    "#C2EDE5",
  },
  surface: {
    DEFAULT: "#1A1A1D",
    light:   "#2D2D30",
    dark:    "#0D0D0F",
    card:    "#242428",
  },
    },
  },
  plugins: [],
}
}
