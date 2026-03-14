import _ from "lodash"
import { validate } from "jskos-validate"

import { addKeywords } from "../utils/searchHelper.js"
import { MalformedBodyError, MalformedRequestError, EntityNotFoundError, DatabaseAccessError, InvalidBodyError } from "../errors/index.js"

import { AbstractService } from "./abstract.js"

export class SchemeService extends AbstractService {

  constructor(config) {
    super(config)
    this.model = this.models.scheme
    this.baseUrl = config.baseUrl
  }

  /**
   * Return a Promise with an array of vocabularies.
   */
  async queryItems(query) {
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
      mongoQuery["subject.uri"] = {
        $in: query.subject.split("|"),
      }
    }
    if (query.license) {
      mongoQuery["license.uri"] = {
        $in: query.license.split("|"),
      }
    }
    if (query.partOf) {
      mongoQuery["partOf.uri"] = {
        $in: query.partOf.split("|"),
      }
    }
    if (query.publisher) {
      mongoQuery._keywordsPublisher = query.publisher
    }
    if (query.notation) {
      const notations = query.notation.split("|")
      mongoQuery.notation = { $in: notations }
    }

    // Sort order (default: asc = 1)
    const order = query.order === "desc" ? -1 : 1
    const sort = {}
    switch (query.sort) {
      case "label":
        sort["_keywordsLabels.0"] = order
        break
      case "notation":
        sort["_keywordsNotation.0"] = order
        break
      case "created":
        sort["created"] = order
        break
      case "modified":
        sort["modified"] = order
        break
      case "counter":
        sort["_uriSuffixNumber"] = order
        break
    }

    // Build aggregation pipeline
    const pipeline = [
      { $match: mongoQuery },
    ]
    if (query.sort === "counter") {
      // Add an additional aggregation step to add _uriSuffixNumber property
      pipeline.push({
        $set: {
          _uriSuffixNumber: {
            $function: {
              body: function (uri) {
                return parseInt(uri.substring(uri.lastIndexOf("/") + 1))
              },
              args: ["$uri"],
              lang: "js",
            },
          },
        },
      })
    }
    if (Object.keys(sort).length > 0) {
      pipeline.push({ $sort: sort })
    }
    const { limit, offset } = this._getLimitAndOffset(query)
    pipeline.push({ $skip: offset })
    pipeline.push({ $limit: limit })

    const schemes = await this.model.aggregate(pipeline)
    schemes.totalCount = await this._count(this.model, [{ $match: mongoQuery }])

    return schemes
  }

  async get(uri) {
    return this.getScheme(uri)
  }

  async getScheme(identifierOrNotation) {
    // TODO: Should we just throw an error 404 here?
    if (!identifierOrNotation) {
      return null
    }
    return await this.model.findOne({ $or: [{ uri: identifierOrNotation }, { identifier: identifierOrNotation }, { notation: new RegExp(`^${_.escapeRegExp(identifierOrNotation)}$`, "i") }] }).lean().exec()
  }

  async replaceSchemeProperties(entity, propertyPaths, ignoreError = true) {
    await Promise.all(propertyPaths.map(async path => {
      const uri = _.get(entity, `${path}.uri`)
      let scheme
      try {
        scheme = await this.getScheme(uri)
      } catch (error) {
        if (!ignoreError) {
          throw new InvalidBodyError(`Scheme with URI ${uri} not found. Only known schemes can be used.`)
        }
      }
      if (scheme) {
        _.set(entity, path, _.pick(scheme, ["uri", "notation"]))
      } else if (!ignoreError) {
        throw new InvalidBodyError(`Scheme with URI ${uri} not found. Only known schemes can be used.`)
      }
    }))
  }

  /**
   * Return a Promise with an array of suggestions in JSKOS format.
   */
  async search(query) {
    let search = query.query || query.search || ""
    let results = await this._searchItems({ search })
    const searchResults = results.slice(query.offset, query.offset + query.limit)
    searchResults.totalCount = results.length
    return searchResults
  }

  // Write endpoints start here

  async updateItem({ body, existing, ...args }) {
    let item = body

    // Prepare
    item = await this.prepareAndCheckItemForAction(item, "update")

    // Override _id, uri, and created properties
    item._id = existing._id
    item.uri = existing.uri
    item.created = existing.created

    // Write item to database
    const result = await this.model.replaceOne({ _id: item.uri }, item)
    if (!result.acknowledged) {
      throw new DatabaseAccessError()
    }
    if (!result.matchedCount) {
      throw new EntityNotFoundError()
    }

    return (await this.postAdjustmentsForItems([item], args))[0]
  }

  async deleteItem({ uri, existing }) {
    if (!uri) {
      throw new MalformedRequestError()
    }
    if (existing.concepts.length) {
      // Disallow deletion
      // ? Which error type?
      throw new MalformedRequestError(`Concept scheme ${uri} still has concepts in the database and therefore can't be deleted.`)
    }
    super.deleteItem({ existing })
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
  async prepareAndCheckItemForAction(scheme, action) {
    if (!_.isObject(scheme)) {
      throw new MalformedBodyError()
    }
    if (["create", "update"].includes(action)) {
      if (!validate.scheme(scheme) || !scheme.uri) {
        throw new InvalidBodyError()
      }
      scheme._id = scheme.uri
      addKeywords(scheme)
      if (action === "update") {
        delete scheme.created
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
   * @param {Boolean} options.bulk indicates whether the adjustments are performaned as part of a bulk operation
   * @returns {[Object]} array of adjusted concept schemes
   */
  async postAdjustmentsForItems(schemes, { bulk = false, setApi = false } = {}) {
    // Get schemes from database instead
    schemes = await this.model.find({ _id: { $in: schemes.map(s => s.uri) } }).lean().exec()
    // First, set created field if necessary
    await this.model.updateMany(
      {
        _id: { $in: schemes.map(s => s.uri) },
        $or: [
          { created: { $eq: null } }, { created: { $exists: false } },
        ],
      },
      {
        $set: {
          created: (new Date()).toISOString(),
        },
      },
    )
    const result = []
    for (let scheme of schemes) {
      const hasTopConcepts = !!(await this.models.concept.findOne({ $or: [scheme.uri].concat(scheme.identifier || []).map(uri => ({ "topConceptOf.uri": uri })) }))
      const hasConcepts = hasTopConcepts || !!(await this.models.concept.findOne({ $or: [scheme.uri].concat(scheme.identifier || []).map(uri => ({ "inScheme.uri": uri })) }))
      const update = {
        $set: {
          concepts: hasConcepts ? [null] : [],
          topConcepts: hasTopConcepts ? [null] : [],
          modified: (new Date()).toISOString(),
        },
      }
      if (setApi) {
        let API = scheme.API || []
        API = API.filter(entry => entry.url !== this.baseUrl)
        if (hasConcepts) {
          API = [
            {
              type: "http://bartoc.org/api-type/jskos",
              url: this.baseUrl,
            },
          ].concat(API)
        }
        if (API.length) {
          _.set(update, "$set.API", API)
        } else {
          _.set(update, "$unset.API", "")
        }
      }
      if (bulk) {
        delete update.$set.modified
      }
      await this.model.updateOne({ _id: scheme.uri }, update)
      result.push(await this.model.findById(scheme.uri))
    }
    return result
  }

  async createIndexes() {
    return this._createIndexes([
      [{ uri: 1 }, {}],
      [{ identifier: 1 }, {}],
      [{ notation: 1 }, {}],
      [{ created: 1 }, {}],
      [{ modified: 1 }, {}],
      [{ "subject.uri": 1 }, {}],
      [{ "license.uri": 1 }, {}],
      [{ "partOf.uri": 1 }, {}],
      [{ _keywordsLabels: 1 }, {}],
      [{ _keywordsPublisher: 1 }, {}],
      // Add additional index for first entry which is used for sorting
      [{ "_keywordsLabels.0": 1 }, {}],
      [
        {
          _keywordsNotation: "text",
          _keywordsLabels: "text",
          _keywordsOther: "text",
          _keywordsPublisher: "text",
        },
        {
          name: "text",
          default_language: "german",
          weights: {
            _keywordsNotation: 10,
            _keywordsLabels: 6,
            _keywordsOther: 3,
            _keywordsPublisher: 3,
          },
        },
      ]])
  }
}
