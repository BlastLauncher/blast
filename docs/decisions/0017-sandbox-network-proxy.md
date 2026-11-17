# 0017 — Sandbox network proxy

Status: accepted 2026-11-17; amends 0013 and 0015

The browser sandbox may route network requests through an embedder-hosted HTTPS
proxy using the opt-in `fetchProxy` option. Without it, requests remain subject
to CORS as in 0013. Our proxy serves the demo only; embedders deploy their own
from this source, as with the sandbox in 0015.

The proxy forwards request contents to the target. Its operator can see those
contents, including API keys, even though the Worker logs and stores nothing.
Origin and Sec-Fetch checks only stop browsers on other sites; scripted clients
can forge them. Per-IP rate limits and size caps bound scripted abuse. Target
validation and redirect checks restrict access to private network addresses.
