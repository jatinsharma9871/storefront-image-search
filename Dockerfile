FROM node:lts-alpine
ENV NODE_ENV=production
ENV TRANSFORMERS_CACHE=/app/.cache
ENV TRANSFORMERS_BACKEND=wasm
ENV NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 3000
RUN chown -R node /usr/src/app
USER node
CMD ["npm", "start"]
