import mongoose from "mongoose"
const Schema = mongoose.Schema

const conceptSchema = new Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

export const Concept = mongoose.model("Concept", conceptSchema)
