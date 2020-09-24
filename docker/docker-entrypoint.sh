#!/bin/sh

# Create default config.json if necessary
if [ ! -f /config/config.json ]; then
  echo '{"mongo":{"host":"mongo"}}' > /config/config.json
fi

pm2-runtime server.js
