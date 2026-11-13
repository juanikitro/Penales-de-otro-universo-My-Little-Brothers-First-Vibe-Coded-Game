FROM node:24.13.0-alpine
WORKDIR /app
COPY --chown=node:node index.html styles.css rules.js game.js character-art.js manifest.webmanifest icon.svg serve.cjs ./
COPY --chown=node:node assets ./assets
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
CMD ["node","serve.cjs"]
