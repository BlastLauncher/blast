/* eslint-disable @typescript-eslint/no-var-requires */
const tailwindcss = require("tailwindcss");

module.exports = {
  syntax: "postcss-scss",
  plugins: ["postcss-preset-env", tailwindcss],
};
