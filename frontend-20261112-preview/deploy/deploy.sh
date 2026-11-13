#!/usr/bin/env bash
# 把新前端部署到服务器（默认 SSH 别名 sensecore-raccoonx-01）。
# 用法：bash deploy/deploy.sh [ssh别名]      站点路径默认 /raccoonx/，可用 BASE_PATH=/xxx/ 覆盖
# 做法：本地构建 → 上传到 /srv/raccoonx/new-frontend/releases/<版本> → 切换 current 软链接
#       → 确保 nginx 容器 raccoonx-new-frontend 在 80 端口运行。只保留最近 5 个版本。
# 回滚：ssh 上去执行 sudo ln -sfn releases/<旧版本> /srv/raccoonx/new-frontend/current
set -Eeuo pipefail

HOST="${1:-sensecore-raccoonx-01}"
BASE_PATH="${BASE_PATH:-/raccoonx/}"
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE=/srv/raccoonx/new-frontend
CONTAINER=raccoonx-new-frontend
IMAGE=nginx:stable-alpine
VERSION="$(date +%Y%m%d-%H%M%S)-$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo local)"

cd "$HERE"
echo "==> 构建 $VERSION"
node node_modules/typescript/bin/tsc --noEmit
VITE_BASE="$BASE_PATH" node node_modules/vite/bin/vite.js build --logLevel warn
cp 使用说明.html dist/guide.html
echo "$VERSION" > dist/version.txt

TARBALL="$(mktemp -t raccoonx-new-frontend).tgz"
COPYFILE_DISABLE=1 tar --no-xattrs -C dist -czf "$TARBALL" .
trap 'rm -f "$TARBALL"' EXIT

echo "==> 上传到 $HOST"
scp -q "$TARBALL" "$HOST:/tmp/raccoonx-new-frontend.tgz"
scp -q deploy/nginx.conf "$HOST:/tmp/raccoonx-new-frontend.nginx.conf"

ssh -T "$HOST" "sudo bash -s" <<EOF
set -Eeuo pipefail
mkdir -p $REMOTE/releases/$VERSION
tar -xzf /tmp/raccoonx-new-frontend.tgz -C $REMOTE/releases/$VERSION
# 容器是单文件挂载 nginx.conf：必须原地覆盖（保持 inode），换文件容器里看不到
cat /tmp/raccoonx-new-frontend.nginx.conf > $REMOTE/nginx.conf && chmod 644 $REMOTE/nginx.conf
rm -f /tmp/raccoonx-new-frontend.tgz /tmp/raccoonx-new-frontend.nginx.conf
chmod -R a+rX $REMOTE
ln -sfn releases/$VERSION $REMOTE/current

if docker ps -a --format '{{.Names}}' | grep -qx $CONTAINER; then
  docker exec $CONTAINER nginx -t && docker exec $CONTAINER nginx -s reload
else
  docker run -d --name $CONTAINER --restart unless-stopped \
    -p 80:80 \
    -v $REMOTE:/srv/site:ro \
    -v $REMOTE/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
    --memory 256m --cpus 1 \
    $IMAGE
fi

# 只保留最近 5 个版本
ls -1dt $REMOTE/releases/* | tail -n +6 | xargs -r rm -rf
echo "当前版本：\$(readlink $REMOTE/current)"
EOF

echo "==> 验证"
sleep 1
IP="$(ssh -G "$HOST" | awk '/^hostname /{print $2}')"
curl -fsS --noproxy '*' "http://$IP${BASE_PATH}version.txt"
echo "完成：http://$IP${BASE_PATH}  设计包 http://$IP${BASE_PATH}design-kit.html  使用说明 http://$IP${BASE_PATH}guide.html"
