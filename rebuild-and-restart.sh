#!/bin/bash

set -euo pipefail
umask 022

run_as_pat() {
    if [ "$(id -un)" = "pat" ]; then
        "$@"
    else
        sudo -u pat -H "$@"
    fi
}

echo "🔨 Building backend..."
cd /home/pat/projects/GuGame/backend
run_as_pat npm run build
chmod -R a+rX /home/pat/projects/GuGame/backend/dist/
echo "✅ Backend built successfully"

echo "🔨 Building frontend..."
cd /home/pat/projects/GuGame/frontend
run_as_pat env VITE_BUILD_ID="$(date -u +%Y%m%d%H%M%S)" npm run build
find dist/assets -type f \( -name '*.js' -o -name '*.css' \) -exec gzip -9 -k -f {} \;
echo "✅ Frontend built successfully"

echo "📦 Copying files to nginx directory..."
mkdir -p /var/www/gugame/
rsync -a --delete dist/ /var/www/gugame/
chmod -R a+rX /var/www/gugame/
echo "✅ Files copied to /var/www/gugame/"

echo "🔄 Restarting services with PM2..."
run_as_pat env PM2_HOME=/home/pat/.pm2 pm2 restart gugame-backend gugame-frontend --update-env

for attempt in {1..15}; do
    if curl --fail --silent --max-time 3 http://127.0.0.1:3001/ > /dev/null; then
        echo "✅ Backend health check passed"
        break
    fi
    if [ "$attempt" -eq 15 ]; then
        echo "❌ Backend health check failed"
        exit 1
    fi
    sleep 1
done

echo "✅ All services rebuilt and restarted!"
run_as_pat env PM2_HOME=/home/pat/.pm2 pm2 status
