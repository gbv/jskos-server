#!/usr/bin/env node

import config from "../config/index.js"

if (process.argv.includes("--debug")) {
  process.env.MONGOMS_DEBUG=1
}

// dynamic import, to take into account env
const { MongoMemoryServer, MongoMemoryReplSet } = await import("mongodb-memory-server")

const { port, db } = config.mongo
if (config.changes) {
  const server = await MongoMemoryReplSet.create({ instanceOpts: [{ port }] })
  console.log(`Started MongoDB replica set ${server.getUri()} database ${db}`)

} else {
  const instance = { port, dbName: db }
  const server = await MongoMemoryServer.create({ instance, replSet: { dbName: db } })
  console.log(`Started MongoDB ${server.getUri()} database ${db}`)
}
