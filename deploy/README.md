# Deploy — Landers VPS

The advertorials-generator tool itself is hosted on Liam's dev VPS
(separate, see project README). This directory only documents how the
**landers VPS** — the dedicated machine that serves published static
landing pages — is set up and maintained.

## Landers VPS

- IP: `187.77.29.59`
- SSH user: `root`
- Web root: `/var/www/landers/<domain>/<path>/`
- nginx: per-domain server blocks generated from
  `deploy/nginx-landers.conf.template`.

## Adding a new publishable domain

1. Add the domain to the brand's `domain_pool` via the Brands & Products
   tab.
2. Point the domain's DNS A record at `187.77.29.59`.
3. SSH to the VPS as root and run:

   ```bash
   bash deploy/provision-domain.sh example.com
   ```

   The script:
   - Copies `nginx-landers.conf.template` to
     `/etc/nginx/sites-available/example.com.conf` with `${DOMAIN}`,
     `${DOCROOT}`, and `${LE_PATH}` substituted.
   - Symlinks it into `sites-enabled/`.
   - Runs `certbot --nginx -d example.com -d www.example.com` to
     provision the Let's Encrypt certificate.
   - Runs `nginx -t && systemctl reload nginx`.

   The script lives in this directory once written (Phase 8 of the
   project). Until then, follow the steps manually.

## Publishing flow

The advertorials-generator's `POST /api/landers/:id/publish` endpoint:

1. Validates the domain against the lander's brand's `domain_pool`.
2. SSH's into the landers VPS using `VPS_LANDERS_SSH_KEY_PATH` (or
   `sshpass` + `VPS_LANDERS_ROOT_PASSWORD`).
3. Creates `/var/www/landers/<domain>/<path>/` if missing.
4. Writes `index.html` (the lander's pre-rendered HTML).
5. Writes any inline assets to the same directory.
6. Returns the final URL — `https://<domain>/<path>/`.

The endpoint is idempotent — re-publishing overwrites `index.html` in
place.

## Safety — do not touch

- The dev VPS that hosts the rebill-dashboard / approval-rates-
  historical / NEW-UGC-Scripts / founders-dashboard tooling is a
  different machine. The landers VPS is dedicated to lander hosting.
  Per Section 0.5 of the project brief, the dev VPS is off-limits for
  this project.
- The product-configs repo is read-only. The landers VPS does NOT
  clone it. Product configs are loaded into the tool's memory via the
  GitHub Contents API; the landers VPS only sees rendered HTML.
