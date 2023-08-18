import _ from "lodash"
import jskos from "jskos-tools"
import validate from "jskos-validate"
import * as utils from "../utils/index.js"

import { Concept } from "../models/concepts.js"
import { schemeService } from "../services/schemes.js"
import { MalformedBodyError, MalformedRequestError, EntityNotFoundError, InvalidBodyError, DatabaseAccessError } from "../errors/index.js"
import config from "../config/index.js"

function conceptFind(query, $skip, $limit, narrower = true) {
  const pipeline = utils.queryToAggregation(query)
  if (narrower) {
    pipeline.push({
      $lookup: {
        from: Concept.collection.name,
        localField: "uri",
        foreignField: "broader.uri",
        as: "narrower",
      },
    })
    pipeline.push({
      $addFields: {
        narrower: {
          $reduce: {
            input: "$narrower",
            initialValue: [],
            in: [null],
          },
        },
      },
    })
  }
  if (_.isNumber($skip)) {
    pipeline.push({ $skip })
  }
  if (_.isNumber($limit)) {
    pipeline.push({ $limit })
  }
  return Concept.aggregate(pipeline)
}

export class ConceptService {

  constructor() {
    // TODOESM?
    this.schemeService = schemeService
  }

  async get(uri) {
    return (await this.getConcepts({ uri, limit: 1, offset: 0 }))[0]
  }

  /**
   * Return a Promise with an array of concept data.
   */
  async getTop(query) {
    let criteria
    if (query.uri) {
      let uris
      // Get scheme from database
      let scheme = await this.schemeService.getScheme(query.uri)
      if (scheme) {
        uris = [scheme.uri].concat(scheme.identifier || [])
      } else {
        uris = [query.uri]
      }
      criteria = { $or: uris.map(uri => ({ "topConceptOf.uri": uri })) }
    } else {
      // Search for all top concepts in all vocabularies
      criteria = { "topConceptOf.uri": { $type: 2 } }
    }
    const concepts = await conceptFind(criteria, query.offset, query.limit)
    concepts.totalCount = await utils.count(Concept, [{ $match: criteria }])
    return concepts
  }

  /**
   * Return a Promise with an array of concepts.
   */
  async getConcepts(query) {
    if (!_.intersection(Object.keys(query), ["uri", "notation", "voc", "near"]).length) {
      return []
    }
    let criteria = []
    const uris = query.uri ? query.uri.split("|") : []
    const notations = query.notation ? query.notation.split("|") : []
    if (uris.length || notations.length) {
      criteria.push({
        $or: [].concat(uris.map(uri => ({ uri })), notations.map(notation => ({ notation }))),
      })
    }
    if (query.voc) {
      let uris
      // Get scheme from database
      let scheme = await this.schemeService.getScheme(query.voc)
      if (scheme) {
        uris = [scheme.uri].concat(scheme.identifier || [])
      } else {
        uris = [query.voc]
      }
      criteria.push({ $or: uris.map(uri => ({ "inScheme.uri": uri })) })
    }
    if (query.near) {
      const [latitude, longitude] = query.near.split(",").map(parseFloat)
      // distance is given in km, but MongoDB uses meters
      const distance = (query.distance || 1) * 1000
      if (!_.isFinite(latitude) || !_.isFinite(longitude) || !(latitude >= -90 && latitude <= 90) || !(longitude >= -180 && longitude <= 180)) {
        throw new MalformedRequestError(`Parameter \`near\` (${query.near}) is malformed. The correct format is "latitude,longitude" with latitude between -90 and 90 and longitude between -180 and 180.`)
      }
      if (!distance) {
        throw new MalformedRequestError(`Parameter \`distance\` (${query.distance}) is malformed. Please give a number in km (default: 1).`)
      }
      criteria.push({
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            $maxDistance: distance,
          },
        },
      })
    }
    const mongoQuery = { $and: criteria }
    if (query.download) {
      return conceptFind(mongoQuery, null, null, false).cursor()
    }
    const concepts = await conceptFind(mongoQuery, query.offset, query.limit)
    concepts.totalCount = await utils.count(Concept, utils.queryToAggregation(mongoQuery))
    return concepts
  }

  /**
   * Return a Promise with an array of concept data.
   */
  async getNarrower(query) {
    if (!query.uri) {
      return []
    }
    return await conceptFind({ broader: { $elemMatch: { uri: query.uri } } })
  }

  /**
   * Return a Promise with an array of concept data.
   */
  async getAncestors(query, root = true) {
    if (!query.uri) {
      return []
    }
    const uri = query.uri
    // First retrieve the concept object from database
    const concept = (await conceptFind({ _id: uri }))[0]
    if (!concept) {
      return []
    }
    if (concept.broader && concept.broader.length) {
      // Load next parent
      let parentUri = concept.broader[0].uri
      // Temporary fix for self-referencing broader
      parentUri = parentUri == uri ? (concept.broader[1] && concept.broader[1].uri) : parentUri
      if (!parentUri) {
        if (root) {
          return []
        } else {
          return [concept]
        }
      }
      const ancestors = await this.getAncestors({ uri: parentUri }, false)
      if (root) {
        return ancestors
      } else {
        return [concept].concat(ancestors)
      }
    } else if (!root) {
      return [concept]
    } else {
      return []
    }
  }

  /**
   * Return a Promise with suggestions, either in OpenSearch Suggest Format or JSKOS (?format=jskos).
   */
  async getSuggestions(query) {
    let search = query.search = query.search || ""
    let format = query.format || ""
    let results = await this.searchConcept(search, query.voc)
    if (format.toLowerCase() == "jskos") {
      // Return in JSKOS format
      return results.slice(query.offset, query.offset + query.limit)
    }
    return utils.searchHelper.toOpenSearchSuggestFormat({
      query,
      results,
    })
  }

  /**
   * Return a Promise with an array of suggestions in JSKOS format.
   */
  async search(query) {
    let search = query.query || query.search || ""
    let results = await this.searchConcept(search, query.voc)
    const searchResults = results.slice(query.offset, query.offset + query.limit)
    searchResults.totalCount = results.length
    return searchResults
  }

  async searchConcept(search, voc) {
    return utils.searchHelper.searchItem({
      search,
      voc,
      schemeService: this.schemeService,
      queryFunction: conceptFind,
    })
  }

  // Write endpoints start here

  async postConcept({ bodyStream, bulk = false, setApi = false, bulkReplace = true, scheme }) {
    if (!bodyStream) {
      throw new MalformedBodyError()
    }

    let isMultiple = true
    bodyStream.on("isSingleObject", () => {
      isMultiple = false
    })

    let response, preparation

    if (bulk) {
      preparation = await new Promise((resolve) => {
        const preparation = {
          concepts: [],
          schemeUrisToAdjust: [],
          errors: [],
        }
        let current = []
        const saveObjects = async (objects) => {
          const { concepts, errors, schemeUrisToAdjust } = await this.prepareAndCheckConcepts(objects, { scheme })
          concepts.length && await Concept.bulkWrite(utils.bulkOperationForEntities({ entities: concepts, replace: bulkReplace }))
          preparation.concepts = preparation.concepts.concat(concepts.map(c => ({ uri: c.uri })))
          preparation.errors = preparation.errors.concat(errors.map(c => ({ uri: c.uri })))
          preparation.schemeUrisToAdjust = _.uniq(preparation.schemeUrisToAdjust.concat(schemeUrisToAdjust))
        }
        const promises = []
        bodyStream.on("data", (concept) => {
          current.push(concept)
          if (current.length % 5000 == 0) {
            promises.push(saveObjects(current))
            current = []
          }
        })
        bodyStream.on("end", async () => {
          promises.push(saveObjects(current))
          await Promise.all(promises)
          preparation.errors.length && config.warn(`Warning on bulk import of concepts: ${preparation.errors.length} concepts were not imported due to validation errors.`)
          resolve(preparation)
        })
      })
      response = preparation.concepts
    } else {
      // Fully assemble body for non-bulk operations
      let concepts = await new Promise((resolve) => {
        const body = []
        bodyStream.on("data", concept => {
          body.push(concept)
        })
        bodyStream.on("end", () => {
          resolve(body)
        })
      })
      // Prepare
      preparation = await this.prepareAndCheckConcepts(concepts, { scheme })
      concepts = preparation.concepts
      if (preparation.errors.length) {
        // Throw first error
        throw preparation.errors[0]
      }
      // Insert concepts
      response = await Concept.insertMany(concepts, { lean: true })
    }

    preparation.setApi = setApi
    await this.postAdjustmentsForConcepts(preparation)

    return isMultiple ? response : response[0]
  }

  async putConcept({ body, existing }) {
    if (!body) {
      throw new MalformedBodyError()
    }

    if (!_.isObject(body)) {
      throw new MalformedBodyError()
    }
    let concept = body

    // Prepare
    const preparation = await this.prepareAndCheckConcepts([concept])

    // Throw error if necessary
    if (preparation.errors.length) {
      throw preparation.errors[0]
    }
    concept = preparation.concepts[0]

    // Override _id, uri, and created properties
    concept._id = existing._id
    concept.uri = existing.uri
    concept.created = existing.created

    // Write concept to database
    const result = await Concept.replaceOne({ _id: existing._id }, concept)
    if (!result.acknowledged) {
      throw new DatabaseAccessError()
    }
    if (!result.matchedCount) {
      throw new EntityNotFoundError()
    }

    // ? Can we return the request without waiting for this step?
    await this.postAdjustmentsForConcepts(preparation)

    return concept
  }

  async deleteConcept({ uri, existing, setApi = false }) {
    if (!uri) {
      throw new MalformedRequestError()
    }

    const result = await Concept.deleteOne({ _id: existing._id })
    if (!result.deletedCount) {
      throw new DatabaseAccessError()
    }

    await this.postAdjustmentsForConcepts({
      // Adjust scheme in case it was its last concept
      schemeUrisToAdjust: [_.get(existing, "inScheme[0].uri")],
      conceptUrisWithNarrower: [],
      setApi,
    })
  }

  async deleteConceptsFromScheme({ uri, scheme, setApi = false }) {
    if (!uri && !scheme) {
      throw new MalformedRequestError()
    }
    if (uri && !scheme) {
      scheme = await this.schemeService.getScheme(uri)
    }
    if (!scheme) {
      throw new EntityNotFoundError(`Could not find scheme with URI ${uri} to delete concepts from.`)
    }

    const result = await Concept.deleteMany({ "inScheme.uri": { $in: [scheme.uri].concat(scheme.identifier || []) } })
    if (!result) {
      throw new DatabaseAccessError()
    }
    if (!result.deletedCount) {
      throw new EntityNotFoundError("No concepts found to delete.")
    }
    await this.postAdjustmentsForConcepts({
      schemeUrisToAdjust: [uri],
      conceptUrisWithNarrower: [],
      setApi,
    })
  }

  /**
   * Prepares and checks a list of concepts before inserting/updating (see `prepareAndCheckConcept`).
   *
   * @param {Object} allConcept concept objects
   * @returns {Object} preparation object with properties `concepts`, `errors`, `schemeUrisToAdjust`, and `conceptUrisWithNarrower`; needs to be provided to `postAdjustmentsForConcepts`
   */
  async prepareAndCheckConcepts(allConcepts, { scheme } = {}) {
    const getSchemeUri = c => _.get(c, "inScheme[0].uri") || _.get(c, "topConceptOf[0].uri")
    const schemeUrisToAdjust = []
    const concepts = []
    const errors = []
    // Set inScheme for concepts when `scheme` option is given
    if (scheme) {
      allConcepts.forEach(concept => {
        if (!getSchemeUri(concept)) {
          concept.inScheme = [{ uri: scheme }]
        }
      })
    }
    // Load all schemes for concepts
    const schemes = await this.schemeService.getSchemes({
      uri: allConcepts
        .map(c => getSchemeUri(c))
        .filter(s => s != null)
        .join("|"),
    })
    for (let concept of allConcepts) {
      try {
        await this.prepareAndCheckConcept(concept, schemes)
        let scheme = _.get(concept, "inScheme[0].uri")
        if (scheme && !schemeUrisToAdjust.includes(scheme)) {
          schemeUrisToAdjust.push(scheme)
        }
        concepts.push(concept)
      } catch(error) {
        errors.push(error)
      }
    }
    return {
      concepts,
      errors,
      schemeUrisToAdjust,
    }
  }

  /**
   * Prepares and checks a concept before inserting/updating:
   * - copies `topConceptOf` to `inScheme` if necessary
   * - validates object, throws error if it doesn't
   * - makes sure that it has a valid scheme, throws error if it doesn't
   * - adjust scheme URI if necessary
   * - adds certain keyword properties necessary for text indexes
   *
   * @param {Object} concept concept object
   * @param {[Object]} schemes array of schemes
   */
  async prepareAndCheckConcept(concept, schemes) {
    concept._id = concept.uri
    // Add "inScheme" for all top concepts
    if (!concept.inScheme && concept.topConceptOf) {
      concept.inScheme = concept.topConceptOf
    }
    // Remove `narrower` and `ancestors` properties => we're only using `broader` to build the concept hierarchy
    delete concept.narrower
    delete concept.ancestors
    // Validate concept
    if (!validate.concept(concept) || !concept.uri) {
      throw new InvalidBodyError()
    }
    // Check concept scheme
    const inScheme = _.get(concept, "inScheme[0]")
    // Load scheme from database if necessary
    if (!schemes || !schemes.length) {
      schemes = await this.schemeService.getSchemes({ uri: inScheme.uri })
    }
    const scheme = schemes.find(s => jskos.compare(s, inScheme))
    if (!scheme) {
    // Either no scheme at all or not found in database
      let message = "Error when adding concept to database: "
      if (inScheme) {
        message += `Concept scheme with URI ${inScheme.uri} is not supported.`
      } else {
        message += "Concept has no concept scheme."
      }
      throw new MalformedRequestError(message)
    }
    // Adjust URIs of schemes
    concept.inScheme[0].uri = scheme.uri
    if (concept.topConceptOf && concept.topConceptOf.length) {
      concept.topConceptOf[0].uri = scheme.uri
    }
    // Add index keywords
    utils.searchHelper.addKeywords(concept)
  }

  /**
   * Post-adjustments for concepts:
   * - runs `postAdjustmentsForScheme` for relevant schemes in `preparation.schemeUrisToAdjust`
   * - adds `narrower: [null]` for concepts in `preparation.conceptUrisWithNarrower`
   *
   * @param {Object} preparation preparation object that is returned by `prepareAndCheckConcepts`
   */
  async postAdjustmentsForConcepts(preparation) {
    // Adjust scheme after adding concept
    await this.schemeService.postAdjustmentsForScheme(preparation.schemeUrisToAdjust.map(uri => ({ uri })), { setApi: preparation.setApi })
  }

  async createIndexes() {
    const indexes = []
    indexes.push([{ "broader.uri": 1 }, {}])
    indexes.push([{ "topConceptOf.uri": 1 }, {}])
    indexes.push([{ "inScheme.uri": 1 }, {}])
    indexes.push([{ uri: 1 }, {}])
    indexes.push([{ notation: 1 }, {}])
    indexes.push([{ identifier: 1 }, {}])
    indexes.push([{ _keywordsLabels: 1 }, {}])
    indexes.push([{ location: "2dsphere" }, {}])
    indexes.push([
      {
        _keywordsNotation: "text",
        _keywordsLabels: "text",
        _keywordsOther: "text",
      },
      {
        name: "text",
        default_language: "german",
        weights: {
          _keywordsNotation: 10,
          _keywordsLabels: 6,
          _keywordsOther: 3,
        },
      },
    ])
    // Create collection if necessary
    try {
      await Concept.createCollection()
    } catch (error) {
      // Ignore error
    }
    // Drop existing indexes
    await Concept.collection.dropIndexes()
    for (let [index, options] of indexes) {
      await Concept.collection.createIndex(index, options)
    }
  }

}

export const conceptService = new ConceptService()
