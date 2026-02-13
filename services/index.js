import { AnnotationService } from "./annotations.js"
import { ConceptService } from "./concepts.js"
import { ConcordanceService } from "./concordances.js"
import { MappingService } from "./mappings.js"
import { SchemeService } from "./schemes.js"
import { RegistryService } from "./registries.js"

export function createServices(config) {
  const annotationService = new AnnotationService(config)
  const conceptService = new ConceptService(config)
  const concordanceService = new ConcordanceService(config)
  const mappingService = new MappingService(config)
  const schemeService = new SchemeService(config)
  const registryService = new RegistryService(config)

  const services = {
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

  return services
}
