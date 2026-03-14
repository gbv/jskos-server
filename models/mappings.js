import mongoose from "mongoose"
import jskos from "jskos-tools"

const mappingSchema = new mongoose.Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

mappingSchema.pre("save", function(next) {
  this.set("identifier", jskos.addMappingIdentifiers(this).identifier)
  next()
})

export const Mapping = mongoose.model("Mapping", mappingSchema)
