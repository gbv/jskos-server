import mongoose from "mongoose"
const Schema = mongoose.Schema

const terminologySchema = new Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

// TODO: Maybe remove "Terminology"
export const Terminology = mongoose.model("Terminology", terminologySchema)
export const Scheme = Terminology
