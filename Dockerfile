# AXORA SOLUTIONS · imagen única (backend + frontend compilado). Sin probar en este entorno: valide el build en su máquina.
FROM node:20-slim AS front
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=front /app/frontend/dist /app/frontend/dist
# El wallet de Oracle NO va en la imagen: móntelo en /wallet y apunte DB_CONFIG_DIR / DB_WALLET_LOCATION allí.
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]
