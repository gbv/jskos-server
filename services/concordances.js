const Concordance = require("../models/concordances")

module.exports = class ConcordanceService {

  constructor(container) {
    this.schemeService = container.get(require("./schemes"))
  }

  /**
   * Return a Promise with an array of concordances.
   */
  async getConcordances(query) {
    let conditions = []
    // Search by URI
    if (query.uri) {
      conditions.push({ $or: query.uri.split("|").map(uri => ({ "uri": uri })) })
    }
    // Search by fromScheme (URI or notation)
    if (query.fromScheme) {
      // TODO: Use schemeService to get all URIs for scheme.
      conditions.push({ $or: [
        { $or: query.fromScheme.split("|").map(fromScheme => ({ "fromScheme.uri": fromScheme })) },
        { $or: query.fromScheme.split("|").map(fromScheme => ({ "fromScheme.notation": fromScheme })) },
      ] })
    }
    // Search by toScheme (URI or notation)
    if (query.toScheme) {
      // TODO: Use schemeService to get all URIs for scheme.
      conditions.push({ $or: [
        { $or: query.toScheme.split("|").map(toScheme => ({ "toScheme.uri": toScheme })) },
        { $or: query.toScheme.split("|").map(toScheme => ({ "toScheme.notation": toScheme })) }
      ] })
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

}
