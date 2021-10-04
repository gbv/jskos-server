const mongoose = require("mongoose")
const Schema = mongoose.Schema
const jskos = require("jskos-tools")

const mappingSchema = new Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

mappingSchema.pre("save", function(next) {
  // Add mapping identifier
  this.set("identifier", jskos.addMappingIdentifiers(this).identifier)
  next()
})

const Mapping = mongoose.model("Mapping", mappingSchema)

module.exports = Mapping
