const _ = require("lodash")

const { MalformedBodyError, MalformedRequestError, EntityNotFoundError, DatabaseAccessError } = require("../errors")
const Scheme = require("../models/schemes")
const Concept = require("../models/concepts")

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

  // Write endpoints start here

  async postScheme({ body }) {
    if (!body) {
      throw new MalformedBodyError()
    }

    let isMultiple
    let schemes

    if (_.isArray(body)) {
      schemes = body
      isMultiple = true
    } else if (_.isObject(body)) {
      schemes = [body]
      isMultiple = false
    } else {
      throw new MalformedBodyError()
    }

    // Prepare
    for (let scheme of schemes) {
      scheme._id = scheme.uri
    }

    if (isMultiple) {
      await Scheme.insertMany(schemes, { ordered: false, lean: true })
    } else {
      // Write scheme to database
      let scheme = schemes[0]
      // eslint-disable-next-line no-useless-catch
      try {
        scheme = new Scheme(scheme)
        scheme = await scheme.save()
      } catch(error) {
        throw error
      }
      scheme.toObject()
    }

    schemes = await this.schemePostAdjustments(schemes)

    return isMultiple ? schemes : schemes[0]
  }

  async putScheme({ body }) {
    if (!body) {
      throw new MalformedBodyError()
    }


    if (!_.isObject(body)) {
      throw new MalformedBodyError()
    }
    let scheme = body

    // Prepare
    scheme._id = scheme.uri

    // Write scheme to database
    // eslint-disable-next-line no-useless-catch
    try {
      scheme = new Scheme(scheme)
      scheme = await scheme.save()
    } catch(error) {
      throw error
    }
    scheme.toObject()

    ;[scheme] = await this.schemePostAdjustments([scheme])

    return scheme
  }

  async deleteScheme({ uri }) {
    if (!uri) {
      throw new MalformedRequestError()
    }
    const scheme = await Scheme.findById(uri).lean()

    if (!scheme) {
      throw new EntityNotFoundError()
    }

    // TODO: Only allow deletion if no concepts exists - OR: delete all concepts as well.

    const result = await Scheme.deleteOne({ _id: scheme._id })
    if (result.n && result.ok && result.deletedCount) {
      return
    } else {
      throw new DatabaseAccessError()
    }
  }

  async schemePostAdjustments(schemes) {
    const result = []
    for (let scheme of schemes) {
      const hasTopConcepts = !!(await Concept.findOne({ $or: [scheme.uri].concat(scheme.identifier || []).map(uri => ({ "topConceptOf.uri": uri })) }))
      const hasConcepts = hasTopConcepts || !!(await Concept.findOne({ $or: [scheme.uri].concat(scheme.identifier || []).map(uri => ({ "inScheme.uri": uri })) }))
      await Scheme.updateOne({ _id: scheme.uri }, {
        "$set": {
          concepts: hasConcepts ? [null] : [],
          topConcepts: hasTopConcepts ? [null] : [],
        },
      })
      result.push(await Scheme.findById(scheme.uri))
    }
    return result
  }

}
