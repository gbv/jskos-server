import { Upgrader } from "../utils/version.js"

import { Meta } from "../models/meta.js"
import mongoose from "mongoose"

// Set mongoose buffering options
mongoose.set("bufferCommands", true)
mongoose.set("bufferTimeoutMS", 30000)
mongoose.set("strictQuery", false)


export function createDatabase(config) {
  const upgrader = new Upgrader(config)
  const connection = mongoose.connection

  connection.on("connected", () => {
    config.warn("Connected to database")
  })
  const onDisconnected = () => {
    config.warn("Disconnected from database, waiting for automatic reconnect...")
  }

  async function connect() {
    connection.on("disconnected", onDisconnected)
    connection.on("error", (error) => {
      config.error("Database error", error)
    })
    async function _connect() {
      const mongoUri = process.env.MONGO_URI || `${config.mongo.url}/${config.mongo.db}`
      return await mongoose.connect(mongoUri, config.mongo.options)
    }
    const result = await _connect()
    let collections, meta
    try {
      // Check meta collection whether upgrade script is necessary.
      collections = (await connection.db.listCollections().toArray()).map(c => c.name)
      if (!collections.length) {
        // no collections = first launch of jskos-server
        meta = new Meta({ version: config.serverVersion })
        await meta.save()
      } else if (!collections.includes("meta")) {
        // meta does not exist = upgrade from <= 1.1.9
        meta = new Meta({ version: "1.1.9" })
        await meta.save()
      } else {
        // get version from meta
        meta = await Meta.findOne()
      }
      if (meta && upgrader.getUpgrades(meta.version).length) {
        console.warn("Info: jskos-server was updated. Please run \"npm run upgrade\" to perform necessary upgrades to ensure full functionalities of all features.")
      }
    } catch (error) {
      // do nothing
    }
    return result
  }

  function disconnect() {
    connection.removeListener("disconnected", onDisconnected)
    config.log("Disconnected from database (on purpose)")
    return mongoose.disconnect()
  }

  /**
   * Waits for the MongoDB replica set to become available
   * by retrying replSetGetStatus until success or timeout.
   */
  async function waitForReplicaSet({ retries = 10, interval = 3000 } = {}) {
    for (let i = 0; i < retries; i++) {
      try {
        await connection.db.admin().command({ replSetGetStatus: 1 })
        return true
      } catch (err) {
        console.log(
          `Replica set not yet ready (attempt ${i + 1}/${retries}), retrying in ${interval}ms...`,
        )
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    }
    return false
  }

  return {
    connection,
    connect,
    disconnect,
    waitForReplicaSet,
  }
}


