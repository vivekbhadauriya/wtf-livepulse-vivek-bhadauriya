FROM node:20-alpine

ENV TZ=Asia/Kolkata

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY . .

EXPOSE 3001

CMD ["node", "src/index.js"]
