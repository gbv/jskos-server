import { Annotation } from "./annotations.js"
import { Concept } from "./concepts.js"
import { Concordance } from "./concordances.js"
import { Mapping } from "./mappings.js"
import { Meta } from "./meta.js"
import { Scheme } from "./schemes.js"
import { Registry } from "./registries.js"

export {
  Annotation,
  Concept,
  Concordance,
  Mapping,
  Meta,
  Scheme,
  Registry,
}

export const models = {
  scheme: Scheme,
  concept: Concept,
  concordance: Concordance,
  mapping: Mapping,
  annotation: Annotation,
  registry: Registry,
}

Object.keys(models).forEach(type => {
  const plural = type === "registry" ? "registries" : `${type}s`
  Object.defineProperty(models, plural, {
    get: () => models[type],
  })
})
