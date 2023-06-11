# `@blastlauncher/cli`

`@blastlauncher/cli` is a command line tool that used to build and publish Blast Launcher extensions.

I somehow discover that Raycast's extension build output are similar to esbuild's output, so I also use esbuild to bundle the extension and pkg to package the cli executable. Ray's CLI is way smaller, I guess their CLI is written in Go. 🤣

The publish command will upload the extension to npm registry(which is released under `@blast-extensions` for now).

You can learn more about the extension publishing in the [raycast-extensions-mirror](https://github.com/BlastLauncher/raycast-extensions-mirror/blob/main/.github/workflows/extensions_build_publish.yaml) repo.

## Development

```bash
# Output single cjs file with esbuild
pnpm build

# Run the cli
node ./dist/index.cjs --help

# Package to cli executable with pkg
pnpm package

# Run the cli executable
./dist/cli-macos --help
```

## Installation

### npm

```bash
npm install -g @blastlauncher/cli
```

## Help

```bash
Usage: blast [options] [command]

CLI for Blast Launcher

Options:
  -h, --help                               display help for command

Commands:
  publish [options] <path> <organization>  Publish extensions
  build [options] <path>                   Build extensions
  help [command]                           display help for command
```

