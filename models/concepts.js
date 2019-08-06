const mongoose = require("mongoose")
const Schema = mongoose.Schema

const conceptSchema = new Schema({
  _id: String,
  uri: String,
  identifier: [String],
  prefLabel: Schema.Types.Mixed,
  definition: Schema.Types.Mixed,
  scopeNote: Schema.Types.Mixed,
  editorialNote: Schema.Types.Mixed,
  inScheme: [Schema.Types.Mixed],
  topConceptOf: [Schema.Types.Mixed],
  narrower: [Schema.Types.Mixed],
  broader: [Schema.Types.Mixed],
  creator: [Schema.Types.Mixed],
  type: {
    type: [String],
    default: ["http://www.w3.org/2004/02/skos/core#Concept"]
  },
  created: String,
  modified: String,
  _keywordsLabels: [String],
  _keywordsNotation: [String],
  _keywordsOther: [String],
},
{
  versionKey: false,
})

const Concept = mongoose.model("Concept", conceptSchema)

module.exports = Concept
