/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#22c1d4',
        background: '#06272b',
        danger: '#f8485e',
        text: '#eeeeee',
      },
      fontFamily: {
        montserrat: ['Montserrat', 'sans-serif'],
      },
    },
  },
  plugins: [],
};