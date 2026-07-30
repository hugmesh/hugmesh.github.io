# hugmesh-net.github.io

Source for the [hugmesh.net](https://hugmesh.net) marketing/docs site — a static page (no build
step) under `site/`, deployed via GitHub Pages.

## Status

Private and not yet deployed. Before going live:

1. Make this repo public (GitHub Pages custom domains require it on the current plan).
2. Settings → Pages → Source = "GitHub Actions".
3. Flip `.github/workflows/pages.yml`'s trigger from `workflow_dispatch` to
   `push: branches: [main]` (org-wide Actions are currently disabled — see the org settings).
4. Cloudflare DNS: add a `CNAME` record for `hugmesh.net` (or `www`) pointing at
   `hugmesh-net.github.io`, proxied (orange-cloud) so Cloudflare's CNAME flattening
   handles the apex. Enable "Always Use HTTPS".
5. In the repo's Pages settings, set the custom domain to `hugmesh.net` and enforce HTTPS once
   the DNS resolves (GitHub auto-verifies and provisions the certificate).

## Local preview

No build tooling required — open `site/index.html` directly, or serve the folder with any static
file server (`python3 -m http.server --directory site`).
