const mongoose = require("mongoose")
const Schema = mongoose.Schema

const concordanceSchema = new Schema({
  _id: String,
  uri: String,
  notation: [String],
  creator: Schema.Types.Mixed,
  distributions: [Schema.Types.Mixed],
  extent: Number,
  scopeNote: Schema.Types.Mixed,
  fromScheme: Schema.Types.Mixed,
  toScheme: Schema.Types.Mixed,
  created: String,
  type: {
    type: [String],
    default: ["http://rdfs.org/ns/void#Linkset"]
  },
},
{
  versionKey: false,
})

const Concordance = mongoose.model("Concordance", concordanceSchema)

module.exports = Concordance
