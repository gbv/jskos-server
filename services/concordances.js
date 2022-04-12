const _ = require("lodash")
const Concordance = require("../models/concordances")
const Mapping = require("../models/mappings")
const utils = require("../utils")
const config = require("../config")
const validate = require("jskos-validate")

const validateConcordance = validate.concordance

const { MalformedRequestError, EntityNotFoundError, MalformedBodyError, InvalidBodyError, DatabaseAccessError } = require("../errors")

module.exports = class ConcordanceService {

  constructor(container) {
    this.schemeService = container.get(require("./schemes"))
    this.uriBase = config.baseUrl + "concordances/"
  }

  /**
   * Return a Promise with an array of concordances.
   */
  async getConcordances(query) {
    let conditions = []
    // Search by URI
    if (query.uri) {
      const uris = query.uri.split("|")
      conditions.push({ $or: uris.map(uri => ({ uri: uri })).concat(uris.map(uri => ({ identifier: uri }))) })
    }
    // Search by fromScheme/toScheme (URI or notation)
    for (let part of ["fromScheme", "toScheme"]) {
      if (query[part]) {
        let uris = []
        for (let uriOrNotation of query[part].split("|")) {
          let scheme = await this.schemeService.getScheme(uriOrNotation)
          if (scheme) {
            uris = uris.concat(scheme.uri, scheme.identifier || [])
          } else {
            uris = uris.concat(query[part])
          }
        }
        conditions.push({ $or: uris.map(uri => ({ [`${part}.uri`]: uri })) })
      }
    }
    // Search by creator
    if (query.creator) {
      let or = []
      for (let creator of query.creator.split("|")) {
        or.push({ "creator.prefLabel.de": creator })
        or.push({ "creator.prefLabel.en": creator })
      }
      if (or.length) {
        conditions.push({ $or: or })
      }
    }
    // Set mode
    let mode = query.mode
    if (!["and", "or"].includes(mode)) {
      mode = "and"
    }

    const mongoQuery = conditions.length ? { [`$${mode}`]: conditions } : {}

    if (query.download) {
      // For a download, return a stream
      return Concordance.find(mongoQuery).lean().cursor()
    } else {
      // Otherwise, return results
      const concordances = await Concordance.find(mongoQuery).lean().skip(query.offset).limit(query.limit).exec()
      concordances.totalCount = await utils.count(Concordance, [{ $match: mongoQuery }])
      return concordances
    }
  }

  async get(_id) {
    return this.getConcordance(_id)
  }

  /**
   * Returns a promise with a single concordance with ObjectId in req.params._id.
   */
  async getConcordance(uriOrId) {
    if (!uriOrId) {
      throw new MalformedRequestError()
    }
    let result
    // First look via ID
    result = await Concordance.findById(uriOrId).lean()
    if (result) return result
    // Then via URI
    result = await Concordance.findOne({ uri: uriOrId }).lean()
    if (result) return result
    // Then via identifier
    result = await Concordance.findOne({ identifier: uriOrId }).lean()
    if (result) return result

    throw new EntityNotFoundError(null, uriOrId)
  }

  /**
   * Save a single concordance or multiple concordances in the database. Adds created date, validates the concordance, and adds identifiers.
   */
  async postConcordance({ bodyStream }) {
    if (!bodyStream) {
      throw new MalformedBodyError()
    }

    let isMultiple = true

    // As a workaround, build body from bodyStream
    let concordances = await new Promise((resolve) => {
      const body = []
      bodyStream.on("data", concordance => {
        body.push(concordance)
      })
      bodyStream.on("isSingleObject", () => {
        isMultiple = false
      })
      bodyStream.on("end", () => {
        resolve(body)
      })
    })

    let response

    // Adjust all concordances
    for (const concordance of concordances) {
      // Add created and modified dates.
      const now = (new Date()).toISOString()
      if (!concordance.created) {
        concordance.created = now
      }
      concordance.modified = now
      // Validate concordance
      if (!validateConcordance(concordance)) {
        throw new InvalidBodyError()
      }
      // Check if schemes are available and replace them with URI/notation only
      await this.schemeService.replaceSchemeProperties(concordance, ["fromScheme", "toScheme"], false)

      // _id and URI
      delete concordance._id
      if (concordance.uri) {
        let uri = concordance.uri
        // URI already exists, use if it's valid, otherwise move to identifier
        if (uri.startsWith(this.uriBase)) {
          concordance._id = uri.slice(this.uriBase.length, uri.length)
          concordance.notation = [concordance._id].concat((concordance.notation || []).slice(1))
        } else {
          concordance.identifier = (concordance.identifier || []).concat([uri])
        }
      }
      if (!concordance._id) {
        concordance._id = concordance.notation && concordance.notation[0] || utils.uuid()
        concordance.uri = this.uriBase + concordance._id
        concordance.notation = [concordance._id].concat((concordance.notation || []).slice(1))
      }
      // Extent should be 0 when added; will be updated in postAdjustmentForConcordance whenever there are changes
      concordance.extent = "0"
    }
    concordances = concordances.filter(m => m)

    response = await Concordance.insertMany(concordances, { lean: true })

    return isMultiple ? response : response[0]
  }

  async putConcordance({ body, existing }) {
    let concordance = body
    if (!concordance) {
      throw new InvalidBodyError()
    }

    // Override some properties from existing that shouldn't change
    // TODO: Should we throw errors if user tries to change these?
    for (const prop of ["_id", "uri", "notation", "fromScheme", "toScheme", "created"]) {
      concordance[prop] = existing[prop]
    }
    // Add modified date.
    concordance.modified = (new Date()).toISOString()
    if (existing.extent) {
      concordance.extent = existing.extent
    } else {
      _.unset(concordance, "extent")
    }
    if (existing.distributions) {
      concordance.distributions = existing.distributions
    } else {
      _.unset(concordance, "distributions")
    }
    // Validate concordance
    if (!validateConcordance(concordance)) {
      throw new InvalidBodyError()
    }

    const result = await Concordance.replaceOne({ _id: existing._id }, concordance)
    if (result.acknowledged && result.matchedCount) {
      await this.postAdjustmentForConcordance(existing._id)
      return concordance
    } else {
      throw new DatabaseAccessError()
    }
  }

  async patchConcordance({ body, existing }) {
    if (!body) {
      throw new InvalidBodyError()
    }

    // Certain properties that shouldn't change
    let errorMessage = ""
    for (const prop of ["_id", "uri", "notation", "fromScheme", "toScheme", "created", "extent", "distributions"]) {
      if (body[prop]) {
        errorMessage += `Field \`${prop}\` can't be changed via PATCH. `
      }
    }
    if (errorMessage) {
      throw new InvalidBodyError(errorMessage)
    }

    let concordance = body

    // Add modified date.
    concordance.modified = (new Date()).toISOString()

    // Use lodash merge to merge concordance objects
    _.merge(existing, concordance)

    // Validate concordance after merge
    if (!validateConcordance(existing)) {
      throw new InvalidBodyError()
    }

    const result = await Concordance.replaceOne({ _id: existing._id }, existing)
    if (result.acknowledged) {
      await this.postAdjustmentForConcordance(existing._id)
      return existing
    } else {
      throw new DatabaseAccessError()
    }
  }

  async deleteConcordance({ existing }) {
    const count = await this.getMappingsCountForConcordance(existing)
    if (count > 0) {
      throw new MalformedRequestError(`Can't delete a concordance that still has mappings associated with it (${count} mappings).`)
    }
    const result = await Concordance.deleteOne({ _id: existing._id })
    if (!result.deletedCount) {
      throw new DatabaseAccessError()
    }
  }

  async getMappingsCountForConcordance(concordance) {
    const uris = [concordance.uri].concat(concordance.identifier || [])
    return await Mapping.count({ $or: uris.map(uri => ({ "partOf.uri": uri })) })
  }

  async postAdjustmentForConcordance(uriOrId) {
    try {
      const concordance = await this.get(uriOrId)
      const count = await this.getMappingsCountForConcordance(concordance)
      if (`${count}` !== concordance.extent) {
        // Update extent with new count
        await Concordance.updateOne({ _id: concordance._id }, { extent: `${count}`, modified: (new Date()).toISOString() })
      }
    } catch (error) {
      // Ignore errors here
    }
  }

  async createIndexes() {
    const indexes = []
    indexes.push([{ uri: 1 }, {}])
    indexes.push([{ identifier: 1 }, {}])
    indexes.push([{ notation: 1 }, {}])
    indexes.push([{ "fromScheme.uri": 1 }, {}])
    indexes.push([{ "toScheme.uri": 1 }, {}])
    // Create collection if necessary
    try {
      await Concordance.createCollection()
    } catch (error) {
      // Ignore error
    }
    // Drop existing indexes
    await Concordance.collection.dropIndexes()
    for (let [index, options] of indexes) {
      await Concordance.collection.createIndex(index, options)
    }
  }

}
