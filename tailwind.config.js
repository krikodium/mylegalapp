/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary-dark': 'hsl(215, 60%, 25%)',   // Azul oscuro profundo
        'primary-light': 'hsl(215, 60%, 45%)',  // Azul medio para acentos
        'accent-gold': 'hsl(45, 70%, 50%)',    // Dorado sutil y elegante
        'bg-page': 'hsl(210, 15%, 98%)',       // Fondo muy claro, ligeramente azulado
        'text-dark': 'hsl(215, 20%, 20%)',     // Texto oscuro, casi negro, pero más suave
        'text-medium': 'hsl(215, 10%, 40%)',   // Texto gris medio
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'], // Usado para headings y UI limpia
        serif: ['Lora', 'serif'],           // Usado para texto de cuerpo, profesional
      },
    },
  },
  plugins: [],
}
