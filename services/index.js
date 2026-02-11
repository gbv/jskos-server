import { annotationService } from "./annotations.js"
import { conceptService } from "./concepts.js"
import { concordanceService } from "./concordances.js"
import { mappingService } from "./mappings.js"
import { schemeService } from "./schemes.js"
import { dataService } from "./data.js"
import { statusService } from "./status.js"
import { validateService } from "./validate.js"
import { registryService } from "./registries.js"

export {
  annotationService,
  conceptService,
  concordanceService,
  mappingService,
  schemeService,
  dataService,
  statusService,
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
