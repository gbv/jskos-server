import mongoose from "mongoose"
const Schema = mongoose.Schema

const concordanceSchema = new Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

export const Concordance = mongoose.model("Concordance", concordanceSchema)
