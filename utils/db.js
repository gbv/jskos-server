import config, { info } from "../config/index.js"
import { getUpgrades } from "../utils/version.js"
const version = info.version
import mongoose from "mongoose"
const connection = mongoose.connection
import { Meta } from "../models/meta.js"

// Set mongoose buffering options
mongoose.set("bufferCommands", true)
mongoose.set("bufferTimeoutMS", 30000)
mongoose.set("strictQuery", false)

connection.on("connected", () => {
  config.warn("Connected to database")
})
const onDisconnected = () => {
  config.warn("Disconnected from database, waiting for automatic reconnect...")
}

export {
  mongoose,
  connection,
}
export async function connect(retry = false) {
  connection.on("disconnected", onDisconnected)
  function addErrorHandler() {
    connection.on("error", (error) => {
      config.error("Database error", error)
    })
  }
  // If retry === false, add error handler before connecting
  !retry && addErrorHandler()
  async function _connect() {
    return await mongoose.connect(`${config.mongo.url}/${config.mongo.db}`, config.mongo.options)
  }
  let result
  while (!result) {
    try {
      result = await _connect()
    } catch (error) {
      if (!retry) {
        throw error
      }
      config.error(error)
    }
    if (!result) {
      config.error("Error connecting to database, trying again in 10 seconds...")
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
  }
  // If retry === true, add error handler after connecting
  retry && addErrorHandler()
  let collections, meta
  try {
    // Check meta collection whether upgrade script is necessary.
    collections = (await connection.db.listCollections().toArray()).map(c => c.name)
    if (!collections.length) {
      // no collections = first launch of jskos-server
      meta = new Meta({ version })
      await meta.save()
    } else if (!collections.includes("meta")) {
      // meta does not exist = upgrade from <= 1.1.9
      meta = new Meta({ version: "1.1.9" })
      await meta.save()
    } else {
      // get version from meta
      meta = await Meta.findOne()
    }
    if (meta && getUpgrades(meta.version).length) {
      console.warn("Info: jskos-server was updated. Please run \"npm run upgrade\" to perform necessary upgrades to ensure full functionalities of all features.")
    }
  } catch (error) {
    // do nothing
  }
  return result
}
export function disconnect() {
  connection.removeListener("disconnected", onDisconnected)
  config.log("Disconnected from database (on purpose)")
  return mongoose.disconnect()
}
