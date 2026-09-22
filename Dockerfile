# Cloud Run 部署用 Dockerfile（多階段建置，搭配 next.config.mjs 的 output: "standalone"）
# GEMINI_API_KEY 不寫進映像檔，於 Cloud Run 以環境變數 / Secret Manager 注入。

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run 會注入 PORT，Next.js 會自動採用
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
