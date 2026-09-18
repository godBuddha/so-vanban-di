# ========== Sổ Văn Bản Đi — image production ==========
# Build cả frontend (React) lẫn backend (Fastify) thành 1 image duy nhất.
# Container chạy: tự migrate DB rồi khởi động API + phục vụ frontend static.

# --- Giai đoạn 1: build frontend ---
FROM node:22-alpine AS webbuild
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# --- Giai đoạn 2: build backend ---
FROM node:22-alpine AS serverbuild
WORKDIR /srv
# Copy schema trước vì npm ci chạy postinstall → prisma generate cần prisma/schema.prisma
COPY server/prisma ./prisma
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npx prisma generate && npm run build

# --- Giai đoạn 3: image chạy ---
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/public
COPY --from=serverbuild /srv/node_modules ./node_modules
COPY --from=serverbuild /srv/dist ./dist
COPY --from=serverbuild /srv/prisma ./prisma
COPY --from=serverbuild /srv/package.json ./package.json
COPY --from=webbuild /web/dist ./public
EXPOSE 3000
# migrate trước khi bật server. Tài khoản quản trị đầu tiên được tự đăng ký
# qua trang "Cài đặt ban đầu" khi truy cập web lần đầu (không có mật khẩu mặc định).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
