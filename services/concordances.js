const Concordance = require("../models/concordances")
const utils = require("../utils")
const config = require("../config")

const { MalformedRequestError, EntityNotFoundError } = require("../errors")

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
   * Returns a promise with a single mapping with ObjectId in req.params._id.
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
