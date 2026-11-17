# CORS proxy

Send requests to `/v1?url=<encoded absolute HTTPS URL>` with the original method,
headers and body. The proxy permits configured origins and CORS fetches only,
blocks private literal addresses and rechecks redirects, limits requests per IP
and caps bodies at 1 MiB (request) and 10 MiB (response). Cookies and forwarding
headers are stripped. The operator can see traffic; do not send secrets.

To deploy your own, install the Cloudflare CLI, configure `wrangler.jsonc` with
your domain, allowed origins and a unique rate-limit namespace, then run
`bunx wrangler deploy` from this directory. Review Cloudflare's account settings and
logging policy before use.
