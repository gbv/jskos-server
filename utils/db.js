const config = require("../config")
const { getUpgrades } = require("../utils/version")
const { version } = require("../package.json")
const mongoose = require("mongoose")
const connection = mongoose.connection
const Meta = require("../models/meta")

// Set mongoose buffering options
mongoose.set("bufferCommands", true)
mongoose.set("bufferTimeoutMS", 30000)

connection.on("connected", () => {
  config.log("Connected to database")
})
connection.on("disconnected", () => {
  config.warn("Disconnected from database, waiting for automatic reconnect...")
})

module.exports = {
  mongoose,
  connection,
  async connect(retry = false) {
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
  },
  disconnect() {
    return mongoose.disconnect()
  },
}
