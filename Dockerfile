# ---------- DSChats 复刻版 ----------
# 零 npm 依赖，所以没有 npm install 步骤，镜像很小、构建很快。

FROM node:22-alpine

# su-exec 用于入口脚本里降权（挂载卷默认属主是 root，需要先修正）
RUN apk add --no-cache su-exec

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
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/data \
 && chmod +x /usr/local/bin/docker-entrypoint.sh \
 && chown -R node:node /app

EXPOSE 3000

# 平台（Render / Fly / Railway / K8s）都认这个健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
