import { annotationService } from "./annotations.js"
import { conceptService } from "./concepts.js"
import { concordanceService } from "./concordances.js"
import { mappingService } from "./mappings.js"
import { schemeService } from "./schemes.js"
import { statusService } from "./status.js"
import { validateService } from "./validate.js"

export {
  annotationService,
  conceptService,
  concordanceService,
  mappingService,
  schemeService,
  statusService,
  validateService,
}

export const byType = {
  scheme: schemeService,
  concept: conceptService,
  concordance: concordanceService,
  mapping: mappingService,
  annotation: annotationService,
}

Object.keys(byType).forEach(type => {
  Object.defineProperty(byType, `${type}s`, {
    get: () => byType[type],
  })
})
