const config = require("../config")
const { getUpgrades } = require("../utils/version")
const { version } = require("../package.json")
const mongoose = require("mongoose")
const connection = mongoose.connection
const Meta = require("../models/meta")

module.exports = {
  mongoose,
  connection,
  async connect() {
    const result = await mongoose.connect(`${config.mongo.url}/${config.mongo.db}`, config.mongo.options)
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
