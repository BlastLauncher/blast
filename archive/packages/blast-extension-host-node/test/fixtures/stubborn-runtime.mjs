process.on("SIGTERM", () => {});
process.stdin.resume();
process.stderr.write("stubborn-ready\n");
setInterval(() => {}, 1_000);
