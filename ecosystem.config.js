module.exports = {
  apps: [
    {
      name: 'runtime',
      script: "pnpm run watch-runtime",
    },
    {
      name: 'client',
      script: "pnpm run start-client"
    }
  ]
}
