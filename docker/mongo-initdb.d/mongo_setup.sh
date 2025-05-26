#!/bin/bash

echo "🕒 Sleeping for 10 seconds to allow MongoDB to start..."
sleep 10

echo "📅 mongo_setup.sh time now: $(date +"%T")"

echo "⚙️ Initiating Replica Set..."

mongosh --host mongo:27017 <<EOF
rs.initiate({
  _id: "rs0",
  version: 1,
  members: [
    {
      _id: 0,
      host: "mongo:27017",
      priority: 1
    }
  ]
});
EOF
