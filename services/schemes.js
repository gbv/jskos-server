const _ = require("lodash")
const validate = require("jskos-validate")

const { MalformedBodyError, MalformedRequestError, EntityNotFoundError, DatabaseAccessError, InvalidBodyError } = require("../errors")
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
    if (query.languages) {
      mongoQuery.languages = {
        $in: query.languages.split(","),
      }
    }
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

  async postScheme({ body, bulk = false }) {
    if (!body) {
      throw new MalformedBodyError()
    }

    let response
    let isMultiple
    let schemes

    if (_.isArray(body)) {
      schemes = body
      isMultiple = true
    } else if (_.isObject(body)) {
      schemes = [body]
      isMultiple = false
      // ignore `bulk` option
      bulk = false
    } else {
      throw new MalformedBodyError()
    }

    // Prepare
    schemes = await Promise.all(schemes.map(scheme => {
      return this.prepareAndCheckSchemeForAction(scheme, "create")
        .catch(error => {
          // Ignore errors for bulk
          if (bulk) {
            return null
          }
          throw error
        })
    }))
    // Filter out null
    schemes = schemes.filter(s => s)

    if (bulk) {
      // Use bulkWrite for most efficiency
      schemes.length && await Scheme.bulkWrite(schemes.map(s => ({
        replaceOne: {
          filter: { _id: s._id },
          replacement: s,
          upsert: true,
        },
      })))
      schemes = await this.postAdjustmentsForScheme(schemes)
      response = schemes.map(s => ({ uri: s.uri }))
    } else {
      schemes = await Scheme.insertMany(schemes, { lean: true })
      response = await this.postAdjustmentsForScheme(schemes)
    }

    return isMultiple ? response : response[0]
  }

  async putScheme({ body }) {
    let scheme = body

    // Prepare
    scheme = await this.prepareAndCheckSchemeForAction(scheme, "update")

    // Write scheme to database
    const result = await Scheme.replaceOne({ _id: scheme.uri }, scheme)
    if (!result.ok) {
      throw new DatabaseAccessError()
    }
    if (!result.n) {
      throw new EntityNotFoundError()
    }

    scheme = (await this.postAdjustmentsForScheme([scheme]))[0]

    return scheme
  }

  async deleteScheme({ uri }) {
    if (!uri) {
      throw new MalformedRequestError()
    }
    const scheme = await this.prepareAndCheckSchemeForAction({ uri }, "delete")
    const result = await Scheme.deleteOne({ _id: scheme._id })
    if (!result.ok) {
      throw new DatabaseAccessError()
    }
    if (!result.n) {
      throw new EntityNotFoundError()
    }
  }

  /**
   * Prepares and checks a concept scheme before inserting/updating:
   * - validates object, throws error if it doesn't (create/update)
   * - add `_id` property (create/update)
   * - check if it exists, throws error if it doesn't (delete)
   * - check if it has existing concepts in database, throws error if it has (delete)
   *
   * @param {Object} scheme concept scheme object
   * @param {string} action one of "create", "update", and "delete"
   * @returns {Object} prepared concept scheme
   */
  async prepareAndCheckSchemeForAction(scheme, action) {
    if (!_.isObject(scheme)) {
      throw new MalformedBodyError()
    }
    if (["create", "update"].includes(action)) {
      // Validate scheme
      if (!validate.scheme(scheme) || !scheme.uri) {
        throw new InvalidBodyError()
      }
      // Add _id
      scheme._id = scheme.uri
    }
    if (action == "delete") {
      // Replace scheme with scheme from databas
      const uri = scheme.uri
      scheme = await Scheme.findById(uri).lean()
      if (!scheme) {
        throw new EntityNotFoundError(null, uri)
      }
      // Check if concepts exists
      if (scheme.concepts.length) {
        // Disallow deletion
        // ? Which error type?
        throw new MalformedRequestError(`Concept scheme ${uri} still has concepts in the database and therefore can't be deleted.`)
      }
    }

    return scheme
  }

  /**
   * Post-adjustments for concept schemes:
   * - update `concepts` property
   * - update `topConcepts` property
   * - get updated concept scheme from database
   *
   * @param {[Object]} schemes array of concept schemes to be adjusted
   * @returns {[Object]} array of adjusted concept schemes
   */
  async postAdjustmentsForScheme(schemes) {
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
