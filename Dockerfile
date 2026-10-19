# One container: the API, the Rumble scheduler and the built web app on one port.
FROM node:22.22-slim AS web
WORKDIR /app
COPY engine ./engine
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci
COPY web ./web
RUN npm --prefix web run build

FROM node:22.22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATABASE_PATH=/data/fitduel.db
COPY package.json ./
COPY engine ./engine
COPY server ./server
COPY --from=web /app/web/dist ./web/dist
RUN mkdir -p /data && chown node:node /data
EXPOSE 8787
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.ts"]
