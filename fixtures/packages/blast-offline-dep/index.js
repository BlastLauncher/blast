// CommonJS on purpose, like @raycast/utils 1.x: require() must reach the
// runtime's React and @raycast/api.
const { useState } = require("react");
const { List } = require("@raycast/api");
exports.title =
  typeof useState === "function" && List ? "Installed offline dependency" : "broken require";
