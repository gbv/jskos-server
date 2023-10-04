FROM node:18-alpine

WORKDIR /usr/src/app

# Copy and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Bundle app source
COPY . .

EXPOSE 3000

RUN mkdir /config
COPY docker/.env .env

# Use pm2 to run app
RUN npm i -g pm2

COPY docker/docker-entrypoint.sh /usr/local/bin/
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["%%CMD%%"]
