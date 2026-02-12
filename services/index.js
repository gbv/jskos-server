import { AnnotationService } from "./annotations.js"
import { ConceptService } from "./concepts.js"
import { ConcordanceService } from "./concordances.js"
import { MappingService } from "./mappings.js"
import { SchemeService } from "./schemes.js"
import { DataService } from "./data.js"
import { ValidateService } from "./validate.js"
import { RegistryService } from "./registries.js"

import config from "../config/index.js"

const annotationService = new AnnotationService(config)
const conceptService = new ConceptService(config)
const concordanceService = new ConcordanceService(config)
const mappingService = new MappingService(config)
const schemeService = new SchemeService(config)
const dataService = new DataService(config)
const validateService = new ValidateService(config)
const registryService = new RegistryService(config)

export {
  annotationService,
  conceptService,
  concordanceService,
  mappingService,
  schemeService,
  dataService,
  validateService,
  registryService,
}

export const services = {
  scheme: schemeService,
  concept: conceptService,
  concordance: concordanceService,
  mapping: mappingService,
  annotation: annotationService,
  registry: registryService,
}

for (let type of Object.keys(services)) {
  const plural = type === "registry" ? "registries" : `${type}s`

  Object.defineProperty(services, plural, {
    get: () => services[type],
  })
}
