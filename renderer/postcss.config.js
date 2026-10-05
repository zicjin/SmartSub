const path = require('path');

module.exports = {
  plugins: {
    tailwindcss: {
      // Resolve from this file so both Next's Webpack and Turbopack PostCSS
      // workers load the same config regardless of their working directory.
      config: path.resolve(__dirname, 'tailwind.config.js'),
    },
    autoprefixer: {},
  },
};
