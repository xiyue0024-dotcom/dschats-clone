# ---------- DSChats 复刻版 ----------
# 零 npm 依赖，所以没有 npm install 步骤，镜像很小、构建很快。
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# 先拷元数据，利用层缓存
COPY package.json ./

# 再拷源码
COPY server.js ./
COPY lib ./lib
COPY public ./public

# 数据目录必须可写；用非 root 用户运行
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000

# 平台（Render / Fly / Railway / K8s）都认这个健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
