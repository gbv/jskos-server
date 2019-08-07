const mongoose = require("mongoose")
const Schema = mongoose.Schema

const terminologySchema = new Schema({
  _id: String,
  uri: String,
  prefLabel: Schema.Types.Mixed,
  notation: [String],
  identifier: [String],
  license: Schema.Types.Mixed,
  publisher: Schema.Types.Mixed,
  languages: Schema.Types.Mixed, // [String]
  uriPattern: String,
  notationPattern: String,
  type: {
    type: [String],
    default: ["http://www.w3.org/2004/02/skos/core#ConceptScheme"],
  },
  concepts: [Schema.Types.Mixed],
  topConcepts: [Schema.Types.Mixed],
},
{
  versionKey: false,
})

const Terminology = mongoose.model("Terminology", terminologySchema)

module.exports = Terminology
