module.exports = {
  "testEnvironment": "node",
  "verbose": true,
  "preset": "ts-jest",
  "transform": {
    "^.+\\.ts?$": "ts-jest"
  },
  "transformIgnorePatterns": [
    "<rootDir>/node_modules/"
  ]
}
