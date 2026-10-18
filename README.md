# Blast

Blast is a small, open, portable host for Raycast-compatible extensions. It runs
extension commands outside Raycast, renders them into a serializable scene that
any client can draw, and measures compatibility against the latest
`@raycast/api` instead of claiming it.

> **Status:** restarted in October 2026. The previous prototype is frozen under
> [`archive/`](./archive/README.md) and tag `archive/v2-prototype-2026-10-18`.

- [Plan and milestones](./PLAN.md)
- [Contributor and agent workflow](./AGENTS.md)

## Development

Requires Bun and Node.js 24.

```bash
bun install --frozen-lockfile
bun run verify
```

## License

MIT
