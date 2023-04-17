import { Annotation } from "./annotations.js"
import { Concept } from "./concepts.js"
import { Concordance } from "./concordances.js"
import { Mapping } from "./mappings.js"
import { Meta } from "./meta.js"
import { Terminology, Scheme } from "./schemes.js"

export {
  Annotation,
  Concept,
  Concordance,
  Mapping,
  Meta,
  Terminology,
  Scheme,
}

export const byType = {
  scheme: Scheme,
  concept: Concept,
  concordance: Concordance,
  mapping: Mapping,
  annotation: Annotation,
}

Object.keys(byType).forEach(type => {
  Object.defineProperty(byType, `${type}s`, {
    get: () => byType[type],
  })
})
