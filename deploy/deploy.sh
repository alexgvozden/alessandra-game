#!/usr/bin/env sh
# Build and ship the game to game.getperformant.com.
# Usage: sh deploy/deploy.sh
# Server details come from deploy/deploy.env (not in git; copy deploy/deploy.env.example).
# This ships the static files and game-web's own Caddyfile only. The public site
# (hostname, TLS, proxy to game-web:80) lives in the server's front Caddy (README.md, "Deploy").
set -e
cd "$(dirname "$0")/.."
[ -f deploy/deploy.env ] || { echo "Missing deploy/deploy.env (copy deploy/deploy.env.example)" >&2; exit 1; }
. ./deploy/deploy.env
: "${DEPLOY_HOST:?set DEPLOY_HOST in deploy/deploy.env}"
: "${DEPLOY_DIR:?set DEPLOY_DIR in deploy/deploy.env}"
: "${EDGE_NETWORK:?set EDGE_NETWORK in deploy/deploy.env}"

npm run build
tar -czf /tmp/game-dist.tgz -C dist .
ssh "$DEPLOY_HOST" "mkdir -p '$DEPLOY_DIR/dist'"
scp deploy/docker-compose.yml deploy/Caddyfile /tmp/game-dist.tgz "$DEPLOY_HOST:$DEPLOY_DIR/"
ssh "$DEPLOY_HOST" "cd '$DEPLOY_DIR' && printf 'EDGE_NETWORK=%s\n' '$EDGE_NETWORK' > .env \
  && rm -rf dist.new && mkdir dist.new && tar -xzf game-dist.tgz -C dist.new \
  && rm -rf dist.old && mv dist dist.old && mv dist.new dist && rm game-dist.tgz \
  && docker compose up -d && docker compose restart web"
rm /tmp/game-dist.tgz
echo "Deployed: https://game.getperformant.com"
