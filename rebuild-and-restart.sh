#!/bin/bash

set -Eeuo pipefail
umask 022

ROOT=/home/pat/projects/GuGame
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
WEB_LINK=/var/www/gugame
WEB_RELEASES=/var/www/gugame-releases
FRONTEND_RELEASES="$FRONTEND_DIR/.releases"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$$"
BACKEND_BACKUP="$BACKEND_DIR/.dist-backup-$RELEASE_ID"
FRONTEND_RELEASE="$FRONTEND_RELEASES/$RELEASE_ID"
WEB_RELEASE="$WEB_RELEASES/$RELEASE_ID"
FRONTEND_PREVIOUS=
WEB_PREVIOUS=
ACTIVATED=0

run_as_pat() {
    if [ "$(id -un)" = "pat" ]; then
        "$@"
    else
        sudo -u pat -H "$@"
    fi
}

pm2() {
    run_as_pat env PM2_HOME=/home/pat/.pm2 pm2 "$@"
}

capture_release() {
    local link_path=$1
    local release_root=$2
    local label=$3

    if [ -L "$link_path" ]; then
        readlink -f "$link_path"
    elif [ -d "$link_path" ]; then
        local legacy="$release_root/legacy-$RELEASE_ID-$label"
        mv "$link_path" "$legacy"
        printf '%s\n' "$legacy"
    fi
}

switch_release() {
    local link_path=$1
    local target=$2
    local next_link="${link_path}.next-$RELEASE_ID"

    ln -s "$target" "$next_link"
    mv -Tf "$next_link" "$link_path"
}

check_json() {
    local url=$1
    local expression=$2
    local payload
    payload="$(curl --fail --silent --show-error --max-time 5 "$url")"
    node -e "const value=JSON.parse(process.argv[1]); if (!($expression)) process.exit(1)" "$payload"
}

wait_for_services() {
    local attempt
    for attempt in {1..20}; do
        if check_json http://127.0.0.1:3001/ "value.message === 'GuGame Backend API'" \
            && check_json http://127.0.0.1:3001/api/auth/user "typeof value.authenticated === 'boolean'" \
            && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:5173/ >/dev/null \
            && curl --fail --silent --show-error --max-time 5 -H 'Host: api.questcity.cloud' http://127.0.0.1/gugame/ >/dev/null \
            && pm2 jlist | node -e '
                let input="";
                process.stdin.on("data", chunk => input += chunk);
                process.stdin.on("end", () => {
                    const apps = JSON.parse(input);
                    const required = new Set(["gugame-backend", "gugame-frontend"]);
                    for (const app of apps) {
                        if (app.pm2_env?.status === "online") required.delete(app.name);
                    }
                    process.exit(required.size === 0 ? 0 : 1);
                });
            '; then
            return 0
        fi
        sleep 1
    done
    return 1
}

rollback() {
    local exit_code=$?
    trap - ERR INT TERM
    set +e
    echo "Release failed; restoring the previous build..." >&2

    if [ "$ACTIVATED" -eq 1 ]; then
        [ -n "$FRONTEND_PREVIOUS" ] && switch_release "$FRONTEND_DIR/dist" "$FRONTEND_PREVIOUS"
        [ -n "$WEB_PREVIOUS" ] && switch_release "$WEB_LINK" "$WEB_PREVIOUS"
        if [ -d "$BACKEND_BACKUP" ]; then
            mv "$BACKEND_DIR/dist" "$BACKEND_DIR/.dist-failed-$RELEASE_ID"
            mv "$BACKEND_BACKUP" "$BACKEND_DIR/dist"
        fi
        pm2 restart gugame-backend gugame-frontend --update-env
        wait_for_services || echo "Rollback completed, but health checks are still failing." >&2
    fi
    exit "$exit_code"
}
trap rollback ERR INT TERM

run_as_pat mkdir -p "$FRONTEND_RELEASES"
mkdir -p "$WEB_RELEASES"
if [ -d "$BACKEND_DIR/dist" ]; then
    cp -a "$BACKEND_DIR/dist" "$BACKEND_BACKUP"
fi

echo "Building backend..."
cd "$BACKEND_DIR"
run_as_pat npm run build
chmod -R a+rX "$BACKEND_DIR/dist"

echo "Building staged frontend release $RELEASE_ID..."
cd "$FRONTEND_DIR"
run_as_pat env VITE_BUILD_ID="$RELEASE_ID" npm run build -- --outDir "$FRONTEND_RELEASE"
find "$FRONTEND_RELEASE/assets" -type f \( -name '*.js' -o -name '*.css' \) -exec gzip -9 -k -f {} \;
test -s "$FRONTEND_RELEASE/index.html"

echo "Staging nginx release..."
mkdir -p "$WEB_RELEASE"
rsync -a --delete "$FRONTEND_RELEASE/" "$WEB_RELEASE/"
chmod -R a+rX "$FRONTEND_RELEASE" "$WEB_RELEASE"

ACTIVATED=1
FRONTEND_PREVIOUS="$(capture_release "$FRONTEND_DIR/dist" "$FRONTEND_RELEASES" frontend || true)"
WEB_PREVIOUS="$(capture_release "$WEB_LINK" "$WEB_RELEASES" nginx || true)"
switch_release "$FRONTEND_DIR/dist" "$FRONTEND_RELEASE"
switch_release "$WEB_LINK" "$WEB_RELEASE"

echo "Restarting services..."
pm2 restart gugame-backend gugame-frontend --update-env

echo "Checking backend, auth API, frontend, nginx, and PM2..."
wait_for_services

trap - ERR INT TERM
ACTIVATED=0
[ -d "$BACKEND_BACKUP" ] && rm -rf "$BACKEND_BACKUP"
echo "Release $RELEASE_ID is healthy."
pm2 status
