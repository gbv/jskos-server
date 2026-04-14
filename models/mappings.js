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

mappingSchema.pre("save", async function() {
  // Add mapping identifier
  this.set("identifier", (await jskos.addMappingIdentifiers(this)).identifier)
})

export const Mapping = mongoose.model("Mapping", mappingSchema)
