const Concordance = require("../models/concordances")

module.exports = class ConcordanceService {

  constructor(container) {
    this.schemeService = container.get(require("./schemes"))
  }

  async get(uri) {
    return (await this.getConcordances({ uri, limit: 1, offset: 0 }))[0]
  }

  /**
   * Return a Promise with an array of concordances.
   */
  async getConcordances(query) {
    let conditions = []
    // Search by URI
    if (query.uri) {
      conditions.push({ $or: query.uri.split("|").map(uri => ({ uri: uri })) })
    }
    // Search by fromScheme/toScheme (URI or notation)
    for (let part of ["fromScheme", "toScheme"]) {
      if (query[part]) {
        // TODO: Use schemeService to get all URIs for scheme.
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
      return Concordance.find(mongoQuery).lean().stream()
    } else {
      // Otherwise, return results
      const concordances = await Concordance.find(mongoQuery).lean().skip(query.offset).limit(query.limit).exec()
      concordances.totalCount = await Concordance.find(mongoQuery).countDocuments()
      return concordances
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
