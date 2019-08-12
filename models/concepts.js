const mongoose = require("mongoose")
const Schema = mongoose.Schema

const conceptSchema = new Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
})

const Concept = mongoose.model("Concept", conceptSchema)

module.exports = Concept
