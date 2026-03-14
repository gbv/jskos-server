import _ from "lodash"
import * as jskos from "jskos-tools"

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
 * Converts a MongoDB "find" query to an aggregation pipeline.
 *
 * In most cases, this will simply be a single $match stage, but there's special handling for
 * $nearSquere queries on the field `location` that is converted into a $geoNear stage.
 *
 * @param {*} query
 * @returns array with aggregation pipeline
 */
export function queryToAggregation(query) {
  const pipeline = []
  // Transform location $nearSphere query into $geoNear aggregation stage
  if (query.location) {
    const locationQuery = query.location.$nearSphere
    pipeline.push({
      $geoNear: {
        spherical: true,
        maxDistance: locationQuery.$maxDistance,
        query: _.omit(query, ["location"]),
        near: locationQuery.$geometry,
        distanceField: "_distance",
      },
    })
  } else {
    pipeline.push({
      $match: query,
    })
  }
  return pipeline
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
