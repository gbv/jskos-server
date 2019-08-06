const mongoose = require("mongoose")
const Schema = mongoose.Schema

const annotationSchema = new Schema({
  _id: String,
  id: String,
  target: String,
  motivation: String,
  bodyValue: String,
  creator: {
    id: String,
    name: String,
  },
  created: {
    type: String,
    default: (new Date()).toISOString()
  },
  modified: {
    type: String,
    default: (new Date()).toISOString()
  },
},
{
  versionKey: false,
})

const Annotation = mongoose.model("Annotation", annotationSchema)

module.exports = Annotation
