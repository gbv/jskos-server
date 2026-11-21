import { Upgrader } from "../utils/version.js"

import { Meta, models } from "../src/models.js"
import mongoose from "mongoose"

// Set mongoose buffering options
mongoose.set("bufferCommands", true)
mongoose.set("bufferTimeoutMS", 30000)
mongoose.set("strictQuery", false)

export class Database {
  constructor(config) {
    this.log = config
    this.mongo = config.mongo
    this.serverVersion = config.serverVersion
    this.upgrader = new Upgrader(config)

    this.connection = mongoose.connection

    this.connection.on("connected", () => {
      this.log.warn("Connected to database")
    })
    this._onDisconnected = () => {
      this.log.warn("Disconnected from database, waiting for automatic reconnect...")
    }
  }

  model(type) {
    return type === "meta" ? Meta : models[type]
  }

  async connect() {
    this.connection.on("disconnected", this._onDisconnected)
    this.connection.on("error", (error) => {
      this.log.error("Database error", error)
    })
    const mongoUri = process.env.MONGO_URI || `${this.mongo.url}/${this.mongo.db}`
    const result = await mongoose.connect(mongoUri, this.mongo.options)

    let collections, meta
    try {
      // Check meta collection whether upgrade script is necessary.
      collections = (await this.connection.db.listCollections().toArray()).map(c => c.name)
      if (!collections.length) {
        // no collections = first launch of jskos-server
        meta = new Meta({ version: this.serverVersion })
        await meta.save()
      } else if (!collections.includes("meta")) {
        // meta does not exist = upgrade from <= 1.1.9
        meta = new Meta({ version: "1.1.9" })
        await meta.save()
      } else {
        // get version from meta
        meta = await Meta.findOne()
      }
      if (meta && this.upgrader.getUpgrades(meta.version).length) {
        console.warn("Info: jskos-server was updated. Please run \"npm run upgrade\" to perform necessary upgrades to ensure full functionalities of all features.")
      }
    } catch (error) {
      // do nothing
    }
    return result
  }

  disconnect() {
    this.connection.removeListener("disconnected", this._onDisconnected)
    this.log.log("Disconnected from database (on purpose)")
    return mongoose.disconnect()
  }

  /**
   * Waits for the MongoDB replica set to become available
   * by retrying replSetGetStatus until success or timeout.
   */
  async waitForReplicaSet({ retries = 10, interval = 3000 } = {}) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.connection.db.admin().command({ replSetGetStatus: 1 })
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
}
