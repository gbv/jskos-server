import mongoose from "mongoose"
const Schema = mongoose.Schema

const registrySchema = new Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

export const Registry = mongoose.model("Registry", registrySchema)
