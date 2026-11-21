import mongoose from "mongoose"
import jskos from "jskos-tools" // for mapping identifier

const createModel = (name, ...schema) => mongoose.model(name, new mongoose.Schema(...schema))

export const Annotation = createModel("Annotation", {
  _id: String,
  id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

export const Concept = createModel("Concept", {
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

export const Concordance = createModel("Concordance", {
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

const mappingSchema = new mongoose.Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

mappingSchema.pre("save", async function() {
  // Add mapping identifier
  this.set("identifier", (await jskos.addMappingIdentifiers(this)).identifier)
})

export const Mapping = mongoose.model("Mapping", mappingSchema)


export const Scheme = createModel("Terminology", {
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

export const Registry = createModel("Registry", {
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
})

export const Meta = createModel("meta", {
  // makes sure that there's only one entry in the collection
  _default: {
    type: Boolean,
    default: true,
    required: true,
    unique: true,
    immutable: true,
  },
  version: String,
}, {
  versionKey: false,
  strict: false,
  collection: "meta",
  autoIndex: false,
})

export const models = {
  scheme: Scheme,
  concept: Concept,
  concordance: Concordance,
  mapping: Mapping,
  annotation: Annotation,
  registry: Registry,
}
