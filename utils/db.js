const config = require("../config")
const mongoose = require("mongoose")
const connection = mongoose.connection

module.exports = {
  mongoose,
  connection,
  async connect() {
    return await mongoose.connect(`${config.mongo.url}/${config.mongo.db}`, config.mongo.options)
  },
  disconnect() {
    return mongoose.disconnect()
  },
}
