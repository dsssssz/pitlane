#!/usr/bin/env bash
# Деплой статики PITLANE в Yandex Object Storage (бакет pitlanegps.ru, отдаётся через API Gateway).
# Ключи: AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (статический ключ SA pitlane-deploy) или ~/.yckeys/s3.json.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=/tmp/plsite; BUCKET=pitlanegps.ru; EP=https://storage.yandexcloud.net
AWS=${AWS:-$(command -v aws || echo "$HOME/.local/bin/aws")}
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] && [ -f "$HOME/.yckeys/s3.json" ]; then
  export AWS_ACCESS_KEY_ID=$(python3 -c "import json;print(json.load(open('$HOME/.yckeys/s3.json'))['access_key']['key_id'])")
  export AWS_SECRET_ACCESS_KEY=$(python3 -c "import json;print(json.load(open('$HOME/.yckeys/s3.json'))['secret'])")
fi
export AWS_DEFAULT_REGION=ru-central1
rm -rf "$OUT"; mkdir -p "$OUT"
{ git -c core.quotepath=off ls-files | grep -vE '^(worker|tools|tests|scripts|yc|hardware)/|(^|/)\.|^wrangler\.toml$|^DEPLOY\.md$|^README\.md$|\.txt$'
  git -c core.quotepath=off ls-files 'hardware/pitlane-gps/web-flash/'; } > /tmp/pl-files
tar -cf - -T /tmp/pl-files | tar -xf - -C "$OUT"
S3="$AWS --endpoint-url=$EP s3"
$S3 sync "$OUT" "s3://$BUCKET" --delete --cache-control "public, max-age=3600" --only-show-errors
put() { $S3 cp "$OUT/$1" "s3://$BUCKET/$1" --content-type "$2" --cache-control "$3" --only-show-errors; }
# явные Content-Type: по расширениям отдельными проходами sync
typ() { $S3 sync "$OUT" "s3://$BUCKET" --exclude '*' --include "$1" --exclude index.html --exclude sw.js --content-type "$2" --cache-control 'public, max-age=3600' --exact-timestamps --only-show-errors; }
typ '*.js' 'text/javascript; charset=utf-8'; typ '*.mjs' 'text/javascript; charset=utf-8'
typ '*.css' 'text/css; charset=utf-8'; typ '*.html' 'text/html; charset=utf-8'
typ '*.json' 'application/json; charset=utf-8'; typ '*.svg' 'image/svg+xml'
typ '*.webmanifest' 'application/manifest+json'; typ '*.wasm' 'application/wasm'
typ '*.glb' 'model/gltf-binary'; typ '*.gltf' 'model/gltf+json'; typ '*.bin' 'application/octet-stream'
put index.html 'text/html; charset=utf-8' no-cache
put sw.js 'text/javascript; charset=utf-8' no-cache
echo "deployed $(wc -l < /tmp/pl-files) files to s3://$BUCKET"
