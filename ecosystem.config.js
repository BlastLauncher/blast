module.exports = {
  apps: [
    {
      name: 'runtime',
      script: "pnpm run start-runtime:dev",
    },
    {
      name: 'client',
      script: "pnpm run start-client"
    }
  ]
}
