import * as jskos from "jskos-tools"

// remove object properties when its value is null
export function removeNullProperties(obj) {
  return Object.keys(obj).filter(key => obj[key] === null).forEach(key => delete obj[key])
}

export function bulkOperationForEntities({ entities, replace = true }) {
  return entities.map(e => (replace ? {
    replaceOne: {
      filter: { _id: e._id },
      replacement: e,
      upsert: true,
    },
  } : {
    insertOne: {
      document: e,
    },
  }))
}


/**
 *
 * @param {Object} mapping mapping to be adjusted
 * @param {Object} [options]
 * @param {Object} [options.concordance] concordance object of mapping
 * @param {Object} [options.fromScheme] manual override for `fromScheme`
 * @param {Object} [options.toScheme] manual override for `toScheme`
 * @returns
 */
export function addMappingSchemes(mapping, options = {}) {
  mapping && ["from", "to"].forEach(side => {
    const field = `${side}Scheme`
    if (mapping[field]) {
      return
    }
    if (options[field]) {
      mapping[field] = options[field]
      return
    }
    options.concordance = options.concordance || mapping.partOf?.[0]
    if (options.concordance?.[field]) {
      mapping[field] = options.concordance[field]
      return
    }
    const concepts = jskos.conceptsOfMapping(mapping, side)
    const schemeFromConcept = concepts.find(concept => concept?.inScheme?.[0]?.uri)?.inScheme[0]
    if (schemeFromConcept) {
      mapping[field] = schemeFromConcept
    }
  })
  return mapping
}


