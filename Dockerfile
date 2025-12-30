FROM node:18-slim

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

ENV NODE_ENV=production
ENV TRANSFORMERS_CACHE=/app/.cache

EXPOSE 3000

CMD ["npm", "start"]
