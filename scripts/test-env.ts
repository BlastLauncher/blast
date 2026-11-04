// Test preload (bunfig.toml): tests must not depend on the developer's shell.
// The TUI palette reads NO_COLOR once at module load, so a shell exporting it
// would flip every colour assertion. Tests that cover colour-free output set it
// themselves.
delete process.env.NO_COLOR;
