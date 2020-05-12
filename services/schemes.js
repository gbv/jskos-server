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
    if (query.type) {
      mongoQuery.type = query.type
    }
    // Note: The `language` parameter at other endpoints means "give me labels in these languages". That's why it should have a different name here. Until then, it is removed.
    // if (query.language) {
    //   mongoQuery.languages = {
    //     $in: query.language.split(","),
    //   }
    // }
    if (query.subject) {
      mongoQuery["subject.uri"] = query.subject
    }

    const schemes = await Scheme.find(mongoQuery).lean().skip(query.offset).limit(query.limit).exec()
    schemes.totalCount = await Scheme.find(mongoQuery).countDocuments()
    return schemes
  }

  async getScheme(identifierOrNotation) {
    return await Scheme.findOne({ $or: [{ uri: identifierOrNotation }, { identifier: identifierOrNotation }, { notation: new RegExp(`^${identifierOrNotation}$`, "i") }]}).lean().exec()
  }

}
