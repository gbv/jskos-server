const mongoose = require("mongoose")
const Schema = mongoose.Schema

const annotationSchema = new Schema({
  _id: String,
  id: String,
}, {
  versionKey: false,
  strict: false,
})

const Annotation = mongoose.model("Annotation", annotationSchema)

module.exports = Annotation
