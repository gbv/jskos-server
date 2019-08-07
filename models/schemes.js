const mongoose = require("mongoose")
const Schema = mongoose.Schema

const terminologySchema = new Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
})

const Terminology = mongoose.model("Terminology", terminologySchema)

module.exports = Terminology
