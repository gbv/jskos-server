FROM node:20-alpine

WORKDIR /usr/src/app

# Copy and install dependencies
COPY package*.json ./
RUN npm ci

# Bundle app source
COPY . .

EXPOSE 3000

RUN mkdir /config
COPY docker/.env .env

# Use pm2 to run app
RUN npm i -g pm2

CMD ["/usr/src/app/docker/docker-entrypoint.sh"]
