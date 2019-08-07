const mongoose = require("mongoose")
const Schema = mongoose.Schema
const jskos = require("jskos-tools")

const mappingSchema = new Schema({
  _id: String,
  from: {
    memberSet: [
      Schema.Types.Mixed,
    ],
  },
  to: {
    memberSet: [
      Schema.Types.Mixed,
    ],
  },
  fromScheme: Schema.Types.Mixed,
  toScheme: Schema.Types.Mixed,
  creator: Schema.Types.Mixed,
  contributor: Schema.Types.Mixed,
  partOf: Schema.Types.Mixed,
  type: {
    type: [String],
    default: ["http://www.w3.org/2004/02/skos/core#mappingRelation"],
  },
  created: {
    type: String,
    default: (new Date()).toISOString(),
  },
  modified: {
    type: String,
    default: (new Date()).toISOString(),
  },
  identifier: [String],
  uri: String,
},
{
  versionKey: false,
})

mappingSchema.pre("save", function(next) {
  // Add mapping identifier
  this.identifier = jskos.addMappingIdentifiers(this).identifier
  next()
})

const Mapping = mongoose.model("Mapping", mappingSchema)

module.exports = Mapping
