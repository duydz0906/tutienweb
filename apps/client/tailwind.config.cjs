/** Tailwind utilities for the new sect/quest/shop HUD; existing handcrafted game UI is preserved. */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: { jade: '#8ed7c3', parchment: '#f2e7d2', amberlight: '#eac58b', night: '#10232a' },
      fontFamily: { sans: ['Be Vietnam Pro', 'sans-serif'], serif: ['Literata', 'Georgia', 'serif'] },
    },
  },
};
