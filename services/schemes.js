const Scheme = require("../models/schemes")

module.exports = class SchemeService {

  /**
   * Return a Promise with an array of vocabularies.
   */
  async getSchemes(query) {
    let mongoQuery = {}
    if (query.uri) {
      mongoQuery = {
        $or: query.uri.split("|").map(uri => ({ uri })).concat(query.uri.split("|").map(uri => ({ identifier: uri }))),
      }
    }
    const schemes = await Scheme.find(mongoQuery).lean().skip(query.offset).limit(query.limit).exec()
    schemes.totalCount = await Scheme.find(mongoQuery).countDocuments()
    return schemes
  }

  async getScheme(identifierOrNotation) {
    return await Scheme.findOne({ $or: [{ uri: identifierOrNotation }, { identifier: identifierOrNotation }, { notation: new RegExp(`^${identifierOrNotation}$`, "i") }]}).lean().exec()
  }

}
