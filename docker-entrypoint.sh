#!/bin/sh
set -e

# 容器里挂载的持久卷默认属主是 root，而应用以 node 用户运行，
# 不修正的话写 data/db.json 会 EACCES。这里先以 root 修属主，再降权执行。
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R node:node /app/data 2>/dev/null || true
  exec su-exec node "$@"
fi

exec "$@"
