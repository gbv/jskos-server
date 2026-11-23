import { AnnotationService } from "./annotations.js"
import { ConceptService } from "./concepts.js"
import { ConcordanceService } from "./concordances.js"
import { MappingService } from "./mappings.js"
import { SchemeService } from "./schemes.js"
import { RegistryService } from "./registries.js"
import { DataService } from "./data.js"
import { ValidateService } from "./validate.js"

function createServices(config) {
  const services = {
    scheme: new SchemeService(config),
    concept: new ConceptService(config),
    concordance:  new ConcordanceService(config),
    mapping: new MappingService(config),
    annotation: new AnnotationService(config),
    registry: new RegistryService(config),
    data: new DataService(config),
    validate: new ValidateService(config),
    typeNames: ["scheme", "concept", "concordance", "mapping", "annotation", "registry"],
  }

  // TODO: remove this
  for (let type of services.typeNames) {
    const plural = type === "registry" ? "registries" : `${type}s`

    Object.defineProperty(services, plural, {
      get: () => services[type],
    })
  }

  return services
}

export { createServices }
