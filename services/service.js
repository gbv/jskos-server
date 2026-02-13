import _ from "lodash"
import jskos from "jskos-tools"

export class Service {
  constructor(config) {
    // logging methods
    this.config = config
    this.log = config.log
    this.warn = config.warn
    this.error = config.error
  }

  async _searchItem({ search, voc, queryFunction }) {
    // Don't try to search for an empty query
    if (!search.length) {
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
    let results = await queryFunction(query)
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
   * Returns the document count for a certain aggregation pipeline.
   * Uses estimatedDocumentCount() if possible (i.e. if the query is empty).
   *
   * @param {*} model a mongoose model
   * @param {*} pipeline an aggregation pipeline
   */
  static async count(model, pipeline) {

    if (pipeline.length === 1 && pipeline[0].$match && Service.isQueryEmpty(pipeline[0].$match)) {
    // It's an empty query, i.e. we can use estimatedDocumentCount()
      return await model.estimatedDocumentCount()
    } else {
    // Use aggregation instead
      return _.get(await model.aggregate(pipeline).count("count").exec(), "[0].count", 0)
    }
  }

  // Determines whether a query is actually empty (i.e. returns all documents).
  static isQueryEmpty(query) {
    const allowedProps = ["$and", "$or"]
    let result = true
    _.forOwn(query, (value, key) => {
      if (!allowedProps.includes(key)) {
        result = false
      } else {
        // for $and and $or, value is an array
        _.forEach(value, (element) => {
          result = result && Service.isQueryEmpty(element)
        })
      }
    })
    return result
  }

}
