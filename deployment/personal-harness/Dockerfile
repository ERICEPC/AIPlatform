FROM docker:27-cli AS cli
FROM node:24-bookworm-slim
COPY --from=cli /usr/local/bin/docker /usr/local/bin/docker
RUN apt-get update && apt-get install -y --no-install-recommends bash git python3 ca-certificates && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY *.mjs ./
COPY platform-ca.pem ./
RUN mkdir /data && chown 1000:1000 /data
EXPOSE 8787
CMD ["node", "/app/server.mjs"]
