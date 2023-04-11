import mongoose from "mongoose"
import jskos from "jskos-tools"

const Schema = mongoose.Schema

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

export const Mapping = mongoose.model("Mapping", mappingSchema)
