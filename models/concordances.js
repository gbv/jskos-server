const mongoose = require("mongoose")
const Schema = mongoose.Schema

const concordanceSchema = new Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

const Concordance = mongoose.model("Concordance", concordanceSchema)

module.exports = Concordance
