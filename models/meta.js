import mongoose from "mongoose"
const Schema = mongoose.Schema

const metaSchema = new Schema({
  // makes sure that there's only one entry in the collection
  _default: {
    type: Boolean,
    default: true,
    required: true,
    unique: true,
    immutable: true,
  },
  version: String,
}, {
  versionKey: false,
  strict: false,
  collection: "meta",
  autoIndex: false,
})

export const Meta = mongoose.model("meta", metaSchema)
