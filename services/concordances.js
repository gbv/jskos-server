import _ from "lodash"
import jskos from "jskos-tools"
import { validate } from "jskos-validate"

import { removeNullProperties } from "../utils/utils.js"
import { uuid } from "../utils/uuid.js"

import { Concordance } from "../models/concordances.js"
import { Mapping } from "../models/mappings.js"
import { SchemeService } from "./schemes.js"

const validateConcordance = validate.concordance

import { MalformedRequestError, EntityNotFoundError, InvalidBodyError, DatabaseAccessError } from "../errors/index.js"

import { AbstractService } from "./abstract.js"

export class ConcordanceService extends AbstractService {

  constructor(config) {
    super(config)
    this.schemeService = new SchemeService(config)
    this.uriBase = config.baseUrl + "concordances/"
    this.model = Concordance
  }

  /**
   * Return a Promise with an array of concordances.
   */
  async queryItems(query) {
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
      const creators = query.creator.split("|")
      conditions.push({
        $or: _.flatten(creators.map(creator => [
          jskos.isValidUri(creator) ? null : { "creator.prefLabel.de": new RegExp(_.escapeRegExp(creator), "i") },
          jskos.isValidUri(creator) ? null : { "creator.prefLabel.en": new RegExp(_.escapeRegExp(creator), "i") },
          jskos.isValidUri(creator) ? { "creator.uri": creator } : null,
        ].filter(Boolean))),
      })
    }
    // Set mode
    let mode = query.mode
    if (!["and", "or"].includes(mode)) {
      mode = "and"
    }

    const mongoQuery = conditions.length ? { [`$${mode}`]: conditions } : {}

    if (query.download) {
      // For a download, return a stream
      return this.model.find(mongoQuery).lean().cursor()
    } else {
      // Otherwise, return results
      const { limit, offset } = this._getLimitAndOffset(query)
      const concordances = await this.model.find(mongoQuery).lean().skip(offset).limit(limit).exec()
      concordances.totalCount = await this._count(this.model, [{ $match: mongoQuery }])
      return concordances
    }
  }

  /**
   * Returns a promise with a single concordance with ObjectId in req.params._id.
   */
  async getItem(uriOrId) {
    if (!uriOrId) {
      throw new MalformedRequestError()
    }
    let result
    // First look via ID
    result = await this.model.findById(uriOrId).lean()
    if (result) {
      return result
    }
    // Then via URI
    result = await this.model.findOne({ uri: uriOrId }).lean()
    if (result) {
      return result
    }
    // Then via identifier
    result = await this.model.findOne({ identifier: uriOrId }).lean()
    if (result) {
      return result
    }

    throw new EntityNotFoundError(null, uriOrId)
  }

  async prepareAndCheckItemForAction(concordance, action, { bulk }) {
    if (action !== "create") {
      return concordance
    }

    // Add created and modified dates.
    const now = (new Date()).toISOString()
    if (!bulk || !concordance.created) {
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
      concordance._id = concordance.notation && concordance.notation[0] || uuid()
      concordance.uri = this.uriBase + concordance._id
      concordance.notation = [concordance._id].concat((concordance.notation || []).slice(1))
    }
    // Extent should be 0 when added; will be updated in postAdjustmentForConcordance whenever there are changes
    concordance.extent = "0"

    return concordance
  }

  async updateItem({ body, existing }) {
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
      delete concordance.extent
    }
    if (existing.distributions) {
      concordance.distributions = existing.distributions
    } else {
      delete concordance.distributions
    }
    // Validate concordance
    if (!validateConcordance(concordance)) {
      throw new InvalidBodyError()
    }

    const result = await this.model.replaceOne({ _id: existing._id }, concordance)
    if (result.acknowledged && result.matchedCount) {
      await this.postAdjustmentForConcordance(existing._id)
      return concordance
    } else {
      throw new DatabaseAccessError()
    }
  }

  async patch({ body, existing }) {
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
    _.assign(existing, concordance)

    removeNullProperties(existing)

    // Validate concordance after merge
    if (!validateConcordance(existing)) {
      throw new InvalidBodyError()
    }

    const result = await this.model.replaceOne({ _id: existing._id }, existing)
    if (result.acknowledged) {
      await this.postAdjustmentForConcordance(existing._id)
      return existing
    } else {
      throw new DatabaseAccessError()
    }
  }

  async deleteItem({ existing }) {
    const count = await this.getMappingsCountForConcordance(existing)
    if (count > 0) {
      throw new MalformedRequestError(`Can't delete a concordance that still has mappings associated with it (${count} mappings).`)
    }
    await super.deleteItem({ existing })
  }

  async getMappingsCountForConcordance(concordance) {
    const uris = [concordance.uri].concat(concordance.identifier || [])
    return await Mapping.countDocuments({ $or: uris.map(uri => ({ "partOf.uri": uri })) })
  }

  async postAdjustmentForConcordance(uriOrId) {
    try {
      const concordance = await this.getItem(uriOrId)
      const count = await this.getMappingsCountForConcordance(concordance)
      if (`${count}` !== concordance.extent) {
        // Update extent with new count
        await this.model.updateOne({ _id: concordance._id }, { extent: `${count}`, modified: (new Date()).toISOString() })
      }
    } catch (error) {
      this.error(error)
    }
  }

  async createIndexes() {
    await this._createIndexes([
      [{ uri: 1 }, {}],
      [{ identifier: 1 }, {}],
      [{ notation: 1 }, {}],
      [{ "fromScheme.uri": 1 }, {}],
      [{ "toScheme.uri": 1 }, {}],
    ])
  }

}
