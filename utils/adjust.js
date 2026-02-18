import _ from "lodash"
import { AnnotationService } from "../services/annotations.js"
import { ConceptService } from "../services/concepts.js"

function createAdjuster(config) {
  const services = {
    annotations: new AnnotationService(config),
    concepts: new ConceptService(config),
  }

  // Adjust data in req.data based on req.type (which is set by `addMiddlewareProperties`)
  const adjust = async (req, res, next) => {
  /**
   * Skip adjustments if either:
   * - there is no data
   * - there is no data type (i.e. we don't know which adjustment method to use)
   * - the request was a bulk operation
   */
    if (!req.data || !req.type || req.query.bulk) {
      next()
    }
    req.data = await adjust.data({ req })
    next()
  }

  // Wrapper around adjustments; `req` only has required property path `query.properties` if `data` and `type` are given.
  adjust.data = async ({ req, data, type }) => {
    data = data ?? req.data
    type = type ?? req.type
    // If data is still a mongoose object, convert it to plain object
    if (Array.isArray(data) && data[0]?.toObject) {
      data = data.map(item => item.toObject ? item.toObject() : item)
    } else if (!Array.isArray(data) && data.toObject) {
      data = data.toObject()
    }
    // Remove "s" from the end of type if it's not an array
    if (!Array.isArray(data)) {
      type = type.substring(0, type.length - 1)
    }
    if (adjust[type]) {
      let addProperties = [], removeProperties = [], mode = 0 // mode 0 = add, mode 1 = remove
      for (let prop of _.get(req, "query.properties", "").split(",")) {
        if (prop.startsWith("*")) {
          addProperties.push("narrower")
          addProperties.push("ancestors")
          addProperties.push("annotations")
          continue
        }
        if (prop.startsWith("-")) {
          mode = 1
          prop = prop.slice(1)
        } else if (prop.startsWith("+")) {
          mode = 0
          prop = prop.slice(1)
        }
        if (mode === 1) {
          removeProperties.push(prop)
        } else {
          addProperties.push(prop)
          // If a property is explicitly added after it was removed, it should not be removed anymore
          removeProperties = removeProperties.filter(p => p !== prop)
        }
      }
      addProperties = addProperties.filter(Boolean)
      removeProperties = removeProperties.filter(Boolean)
      // Adjust data with properties
      data = await adjust[type](data, addProperties)
      // Remove properties if necessary
      const dataToAdjust = Array.isArray(data) ? data : [data]
      removeProperties.forEach(property => {
        dataToAdjust.filter(Boolean).forEach(entity => {
          delete entity[property]
        })
      })
    }
    return data
  }

  // Add @context and type to annotations.
  adjust.annotation = (annotation) => {
    if (annotation) {
      annotation["@context"] = "http://www.w3.org/ns/anno.jsonld"
      annotation.type = "Annotation"
    }
    return annotation
  }
  adjust.annotations = annotations => {
    return annotations.map(annotation => adjust.annotation(annotation))
  }

  // Add @context and type to concepts. Also load properties narrower, ancestors, and annotations if necessary.
  adjust.concept = async (concept, properties = []) => {
    if (concept) {
      concept["@context"] = "https://gbv.github.io/jskos/context.json"
      concept.type = concept.type || ["http://www.w3.org/2004/02/skos/core#Concept"]
      // Add properties (narrower, ancestors)
      for (let property of ["narrower", "ancestors"].filter(p => properties.includes(p))) {
        concept[property] = await Promise.all((await services.concepts[`get${property.charAt(0).toUpperCase() + property.slice(1)}`]({ uri: concept.uri })).map(concept => adjust.concept(concept)))
      }
      // Add properties (annotations)
      if (config.annotations && properties.includes("annotations") && concept.uri) {
        concept.annotations = (await services.annotations.queryItems({ target: concept.uri })).map(annotation => adjust.annotation(annotation))
      }
    }
    return concept
  }
  adjust.concepts = async (concepts, properties) => {
    return await Promise.all(concepts.map(concept => adjust.concept(concept, properties)))
  }

  // Add @context to concordances.
  adjust.concordance = (concordance) => {
    if (concordance) {
      concordance["@context"] = "https://gbv.github.io/jskos/context.json"
      // Remove existing "distributions" array (except for external URLs)
      concordance.distributions = (concordance.distributions || []).filter(dist => !dist.download || !dist.download.startsWith(config.baseUrl))
      // Add distributions for JSKOS and CSV
      concordance.distributions = [
        {
          download: `${config.baseUrl}mappings?partOf=${encodeURIComponent(concordance.uri)}&download=ndjson`,
          format: "http://format.gbv.de/jskos",
          mimetype: "application/x-ndjson; charset=utf-8",
        },
        {
          download: `${config.baseUrl}mappings?partOf=${encodeURIComponent(concordance.uri)}&download=csv`,
          mimetype: "text/csv; charset=utf-8",
        },
      ].concat(concordance.distributions)
    }
    return concordance
  }
  adjust.concordances = (concordances) => {
    return concordances.map(concordance => adjust.concordance(concordance))
  }

  // Add @context to mappings. Also load annotations if necessary.
  adjust.mapping = async (mapping, properties = []) => {
    if (mapping) {
      mapping["@context"] = "https://gbv.github.io/jskos/context.json"
      // Add properties (annotations)
      if (config.annotations && properties.includes("annotations") && mapping.uri) {
        mapping.annotations = (await services.annotations.queryItems({ target: mapping.uri })).map(annotation => adjust.annotation(annotation))
      }
    }
    return mapping
  }
  adjust.mappings = async (mappings, properties) => {
    return await Promise.all(mappings.map(mapping => adjust.mapping(mapping, properties)))
  }

  // Add @context and type to schemes.
  adjust.scheme = (scheme) => {
    if (scheme) {
      scheme["@context"] = "https://gbv.github.io/jskos/context.json"
      scheme.type = scheme.type || ["http://www.w3.org/2004/02/skos/core#ConceptScheme"]
      // Remove existing "distributions" array (except for external URLs)
      scheme.distributions = (scheme.distributions || []).filter(dist => !dist.download || !dist.download.startsWith(config.baseUrl))
      if (scheme.concepts && scheme.concepts.length) {
      // If this instance contains concepts for this scheme, add distribution for it
        scheme.distributions = [
          {
            download: `${config.baseUrl}voc/concepts?uri=${encodeURIComponent(scheme.uri)}&download=ndjson`,
            format: "http://format.gbv.de/jskos",
            mimetype: "application/x-ndjson; charset=utf-8",
          },
          {
            download: `${config.baseUrl}voc/concepts?uri=${encodeURIComponent(scheme.uri)}&download=json`,
            mimetype: "application/json; charset=utf-8",
          },
        ].concat(scheme.distributions)
        // Also add `API` field if it does not exist
        if (!scheme.API) {
          scheme.API = [
            {
              type: "http://bartoc.org/api-type/jskos",
              url: config.baseUrl,
            },
          ]
        }
      }
      // Add distributions based on API field
      (scheme.API || []).filter(api => api.type === "http://bartoc.org/api-type/jskos" && api.url !== config.baseUrl).forEach(api => {
        scheme.distributions.push({
          download: `${api.url}voc/concepts?uri=${encodeURIComponent(scheme.uri)}&download=ndjson`,
          format: "http://format.gbv.de/jskos",
          mimetype: "application/x-ndjson; charset=utf-8",
        })
        scheme.distributions.push({
          download: `${api.url}voc/concepts?uri=${encodeURIComponent(scheme.uri)}&download=json`,
          mimetype: "application/json; charset=utf-8",
        })
      })
      if (!scheme.distributions.length) {
        delete scheme.distributions
      }
    }
    return scheme
  }
  adjust.schemes = (schemes) => {
    return schemes.map(scheme => adjust.scheme(scheme))
  }

  return adjust
}

export { createAdjuster }
