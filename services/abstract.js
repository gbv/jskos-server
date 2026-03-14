import _ from "lodash"
import jskos from "jskos-tools"

import { bulkOperationForEntities } from "../utils/utils.js"
import { MalformedRequestError, MalformedBodyError, EntityNotFoundError, DatabaseAccessError } from "../errors/index.js"
import { toOpenSearchSuggestFormat } from "../utils/searchHelper.js"

export class AbstractService {
  constructor(config) {
    // logging methods
    this.log = config.log
    this.warn = config.warn
    this.error = config.error
  }

  // Low-level database lookup an item by its id
  async retrieveItem(id) {
    return this.model.findById(id).lean()
  }

  // Low-level database query for items
  async retrieveItems(query) {
    return this.model.find(query).lean()
  }

  // High-level lookup an item. Throws an error on failure
  async getItem(id) {
    if (!id) {
      throw new MalformedRequestError()
    }
    const item = await this.retrieveItem(id)
    // TODO: find via identifier?
    if (!item) {
      throw new EntityNotFoundError(null, id)
    }
    return item
  }

  // Low-level database delete an item by its internal id
  async deleteItem({ existing }) {
    const result = await this.model.deleteOne({ _id: existing._id })
    if (!result.deletedCount) {
      throw new DatabaseAccessError()
    }
  }

  // high level access
  async searchItems({ search, voc }) {
    // Don't try to search for an empty query
    if (!search) {
      return []
    }
    // Prepare search query for use in regex
    const searchRegExp = new RegExp(`^${_.escapeRegExp(search).toUpperCase()}`)
    let query, queryOr = [{ _id: search }]
    // let projectAndSort = {}
    if (search.length > 2) {
      // Use text search for queries longer than two characters
      queryOr.push({
        $text: {
          $search: "\"" + search + "\"",
        },
      })
      // Projekt and sort on text score
      // projectAndSort = { score: { $meta: "textScore" } }
    }
    if (search.length <= 2) {
      // Search for notations specifically for one or two characters
      queryOr.push({
        _keywordsNotation: {
          $regex: searchRegExp,
        },
      })
    }
    if (search.length > 1) {
      // Search _keywordsLabels
      // TODO: Rethink this approach.
      queryOr.push({ _keywordsLabels: { $regex: searchRegExp } })
    }
    // Also search for exact matches with the URI (in field _id)
    query = { $or: queryOr }
    // Filter by scheme uri
    if (voc && this.schemeService) {
      let uris
      // Get scheme from database
      let scheme = await this.schemeService.getScheme(voc)
      if (scheme) {
        uris = [scheme.uri].concat(scheme.identifier || [])
      } else {
        uris = [query.uri]
      }
      query = { $and: [query, { $or: uris.map(uri => ({ "inScheme.uri": uri })) }] }
    }
    let results = await this.retrieveItems(query)
    let _search = search.toUpperCase()
    // Prioritize results
    for (let result of results) {
      let priority = 100
      if (result.notation && result.notation.length > 0) {
        let _notation = jskos.notation(result).toUpperCase()
        // Shorter notation equals higher priority
        priority -= _notation.length
        // Notation equals search means highest priority
        if (_search == _notation) {
          priority += 1000
        }
        // Notation starts with serach means higher priority
        if (_notation.startsWith(_search)) {
          priority += 150
        }
      }
      // prefLabel/altLabel equals search means very higher priority
      for (let [labelType, factor] of [["prefLabel", 2.0], ["altLabel", 1.0], ["creator.prefLabel", 0.8], ["definition", 0.7]]) {
        let labels = []
        // Collect all labels
        for (let label of Object.values(_.get(result, labelType, {}))) {
          if (Array.isArray(label)) {
            labels = labels.concat(label)
          } else {
            labels.push(label)
          }
        }
        let matchCount = 0
        let priorityDiff = 0
        for (let label of labels) {
          let _label
          try {
            _label = label.toUpperCase()
          } catch (error) {
            this.error(label, error)
            continue
          }
          if (_search == _label) {
            priorityDiff += 100
            matchCount += 1
          } else if (_label.startsWith(_search)) {
            priorityDiff += 50
            matchCount += 1
          } else if (_label.indexOf(_search) > 0) {
            priorityDiff += 15
            matchCount += 1
          }
        }
        matchCount = Math.pow(matchCount, 2) || 1
        priority += priorityDiff * (factor / matchCount)
      }
      result.priority = priority
    }
    // Sort results first by priority, then by notation
    results = results.sort((a, b) => {
      if (a.priority != b.priority) {
        return b.priority - a.priority
      }
      if (a.notation && a.notation.length && b.notation && b.notation.length) {
        if (jskos.notation(b) > jskos.notation(a)) {
          return -1
        } else {
          return 1
        }
      } else {
        return 0
      }
    })
    return results
  }

  /**
   * Returns normalized limit and offset from query object for pagination.
   */
  _getLimitAndOffset(query) {
    return {
      limit: Number.isFinite(+query.limit) ? Math.max(0, +query.limit) : 100,
      offset: Number.isFinite(+query.offset) ? Math.max(0, +query.offset) : 0,
    }
  }

  /**
   * Remove object properties when its value is null.
   */
  _removeNullProperties(obj) {
    return Object.keys(obj).filter(key => obj[key] === null).forEach(key => delete obj[key])
  }

  /**
   * Returns a Promise with suggestions, either in OpenSearch Suggest Format or JSKOS (?format=jskos).
   */
  async getSuggestions(query) {
    const format = query.format || ""
    const results = await this.searchItems(query)
    if (format.toLowerCase() == "jskos") {
      // Return in JSKOS format with pagination
      const { limit, offset } = this._getLimitAndOffset(query)
      return results.slice(offset, offset + limit)
    }
    return toOpenSearchSuggestFormat({ query, results })
  }

  // to be implemented by subclasses
  async prepareAndCheckItemForAction(item, _action) {
    return item
  }

  // to be implemented by subclasses
  async postAdjustmentsForItems(items) {
    return items
  }

  async createItem({ bodyStream, bulk = false, bulkReplace = true, user, admin = false }) {
    let { items, isMultiple } = await this._readBodyStream(bodyStream)

    items = await Promise.all(items.map(item => {
      return this.prepareAndCheckItemForAction(item, "create", { admin, user, bulk })
        .catch(error => {
          if (bulk) {
            return null
          }
          throw error
        })
    }))
    items = items.filter(Boolean)

    let response
    if (bulk) {
      // Use bulkWrite for most efficiency
      items.length && await this.model.bulkWrite(bulkOperationForEntities({ entities: items, replace: bulkReplace }))
      items = await this.postAdjustmentsForItems(items, { bulk })
      response = items.map(s => ({ uri: s.uri }))
    } else {
      items = await this.model.insertMany(items, { lean: true })
      response = await this.postAdjustmentsForItems(items, { bulk })
    }

    return isMultiple ? response : response[0]
  }

  /**
   * Returns the document count for a certain aggregation pipeline.
   * Uses estimatedDocumentCount() if possible (i.e. if the query is empty).
   *
   * @param {*} model a mongoose model
   * @param {*} pipeline an aggregation pipeline
   */
  async _count(model, pipeline) {
    if (pipeline.length === 1 && pipeline[0].$match && isQueryEmpty(pipeline[0].$match)) {
      // It's an empty query, i.e. we can use estimatedDocumentCount()
      return await model.estimatedDocumentCount()
    } else {
      // Use aggregation instead
      return (await model.aggregate(pipeline).count("count").exec())?.[0]?.count || 0
    }
  }

  /**
   * Converts a body stream into an array of items
   *
   * @param {NodeJS.ReadableStream} bodyStream - The body stream to convert.
   * @returns {Promise<{items: Array, isMultiple: boolean}>}
   */
  async _readBodyStream(bodyStream) {
    if (!bodyStream) {
      throw new MalformedBodyError("Failed to parse request")
    }

    let isMultiple = true
    bodyStream.on("isSingleObject", () => {
      isMultiple = false
    })

    const items = await new Promise((resolve) => {
      const body = []
      bodyStream.on("data", item => {
        body.push(item)
      })
      bodyStream.on("end", () => {
        resolve(body)
      })
    })

    return { items, isMultiple }
  }

  /**
   * Initializes a collection by creating it if absent, removing any existing indexes,
   * and establishing the full set of required indexes.
   *
   * @param {Array} indexes - An array of [index, options] pairs.
   */
  async _createIndexes(indexes) {
    const model = this.model

    // Create collection if necessary
    try {
      await model.createCollection()
    } catch (error) {
      this.error(`Error creating collection for ${model.modelName}:`, error)
      // Ignore error
    }

    // Drop existing indexes
    try {
      await model.collection.dropIndexes()
    } catch (error) {
      this.error(`Error dropping indexes for ${model.modelName}:`, error)
      // Ignore error
    }

    for (const [index, options] of indexes) {
      try {
        await model.collection.createIndex(index, options)
      } catch (error) {
        this.error(`Error creating index for ${model.modelName}:`, error, index, options)
      }
    }
  }

}

// Determines whether a query is actually empty (i.e. returns all documents).
export function isQueryEmpty(query) {
  const allowedProps = ["$and", "$or"]
  let result = true
  _.forOwn(query, (value, key) => {
    if (!allowedProps.includes(key)) {
      result = false
    } else {
      // for $and and $or, value is an array
      _.forEach(value, (element) => {
        result = result && isQueryEmpty(element)
      })
    }
  })
  return result
}


