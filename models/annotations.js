import mongoose from "mongoose"
const Schema = mongoose.Schema

const annotationSchema = new Schema({
  _id: String,
  id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

export const Annotation = mongoose.model("Annotation", annotationSchema)
