# Douyin DL — 生产镜像（含 Playwright Chromium）
FROM mcr.microsoft.com/playwright:v1.63.0-jammy

WORKDIR /app

# 先装依赖，利于缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server ./server
COPY public ./public

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0

# Playwright 镜像已带浏览器，无需再 install chromium
EXPOSE 8787

CMD ["node", "server/index.js"]
