const Scheme = require("../models/schemes")

module.exports = class SchemeService {

  /**
   * Return a Promise with an array of vocabularies.
   */
  async getSchemes(query) {
    let mongoQuery = {}
    if (query.uri) {
      mongoQuery = {
        $or: query.uri.split("|").map(uri => ({ uri })).concat(query.uri.split("|").map(uri => ({ identifier: uri })))
      }
    }
    const cursor = Scheme.find(mongoQuery).lean()
    const schemes = await cursor.skip(query.offset).limit(query.limit).exec()
    schemes.totalCount = await cursor.countDocuments()
    return schemes
  }

}
