#!/usr/bin/env bash
# provision-domain.sh — provision a new publishable domain on the landers VPS.
#
# Usage (run ON the landers VPS as root):
#   bash provision-domain.sh example.com [www.example.com]
#
# What it does:
#   1. Creates /var/www/landers/<domain>/ and a default placeholder index.html.
#   2. Drops a per-domain nginx server block at /etc/nginx/sites-available/<domain>.conf,
#      substituting ${DOMAIN}, ${DOCROOT}, ${LE_PATH} from `nginx-landers.conf.template`.
#   3. Symlinks it into /etc/nginx/sites-enabled/.
#   4. Runs `certbot --nginx -d <domain>` to provision the Let's Encrypt cert.
#   5. Tests + reloads nginx.
#
# Safety:
#   - Idempotent. Re-running with the same domain is a no-op for existing files.
#   - Refuses to overwrite an existing sites-available file unless --force passed.
#   - Refuses any domain that doesn't look like a hostname.
#   - Does NOT modify DNS — that's a manual step (point the A record at 187.77.29.59
#     and verify with `dig` before running this script).

set -euo pipefail

FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    -h|--help)
      sed -n '/^# Usage/,/^# /p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) break ;;
  esac
done

DOMAIN="${1:-}"
ALIAS="${2:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain> [alias]" >&2
  exit 2
fi
if [[ ! "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]]; then
  echo "Invalid domain: $DOMAIN" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/nginx-landers.conf.template"
if [[ ! -f "$TEMPLATE" ]]; then
  echo "Missing $TEMPLATE — copy this script's directory onto the VPS first." >&2
  exit 2
fi

DOCROOT="/var/www/landers/${DOMAIN}"
SITES_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}.conf"
SITES_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"
LE_PATH="/etc/letsencrypt/live/${DOMAIN}"

# ── 1. docroot + placeholder ────────────────────────────────────────────
mkdir -p "$DOCROOT"
chmod 755 "$DOCROOT"
if [[ ! -f "$DOCROOT/index.html" ]]; then
  cat > "$DOCROOT/index.html" <<HTML
<!doctype html>
<html><head><meta charset="utf-8"><title>${DOMAIN}</title></head>
<body><p>Reserved for adv-generator publishing.</p></body></html>
HTML
fi

# ── 2. nginx server block ───────────────────────────────────────────────
if [[ -f "$SITES_AVAILABLE" && "$FORCE" -ne 1 ]]; then
  echo "[skip] $SITES_AVAILABLE already exists. Use --force to overwrite." >&2
else
  sed \
    -e "s|\${DOMAIN}|${DOMAIN}|g" \
    -e "s|\${DOCROOT}|${DOCROOT}|g" \
    -e "s|\${LE_PATH}|${LE_PATH}|g" \
    "$TEMPLATE" > "$SITES_AVAILABLE"
  if [[ -n "$ALIAS" ]]; then
    # Add the alias to the server_name lines.
    sed -i.bak "s|server_name ${DOMAIN};|server_name ${DOMAIN} ${ALIAS};|g" "$SITES_AVAILABLE"
    rm -f "${SITES_AVAILABLE}.bak"
  fi
fi

# ── 3. symlink ──────────────────────────────────────────────────────────
if [[ ! -L "$SITES_ENABLED" ]]; then
  ln -s "$SITES_AVAILABLE" "$SITES_ENABLED"
fi

# ── 4. certbot ──────────────────────────────────────────────────────────
# Provision the cert. The --nginx plugin handles the http-01 challenge by
# temporarily mutating the server block; afterwards it rewrites the server
# block to point at the new cert paths. Our template already references
# ${LE_PATH}/fullchain.pem and privkey.pem so the post-certbot state lines
# up cleanly.
if [[ ! -f "${LE_PATH}/fullchain.pem" ]]; then
  CERT_DOMAINS=( -d "$DOMAIN" )
  if [[ -n "$ALIAS" ]]; then CERT_DOMAINS+=( -d "$ALIAS" ); fi
  certbot --nginx --non-interactive --agree-tos --email liam@acentecom.com "${CERT_DOMAINS[@]}"
else
  echo "[skip] cert at ${LE_PATH} already exists."
fi

# ── 5. test + reload ────────────────────────────────────────────────────
nginx -t
systemctl reload nginx

echo "[ok] ${DOMAIN} provisioned. docroot=${DOCROOT} sites-enabled=${SITES_ENABLED}"
