const _ = require("lodash")
const config = require("../config")

const Concept = require("../models/concepts")

module.exports = class ConceptService {

  constructor(container) {
    this.schemeService = container.get(require("../services/schemes"))
  }

  /**
   * Return a Promise with an array of concept data.
   */
  async getDetails(query) {
    if (!query.uri) {
      return []
    }
    let mongoQuery = {
      $or: query.uri.split("|").map(uri => ({ uri })),
    }

    const concepts = await Concept.find(mongoQuery).lean().skip(query.offset).limit(query.limit).exec()
    concepts.totalCount = await Concept.find(mongoQuery).countDocuments()
    return concepts
  }

  /**
   * Return a Promise with an array of concept data.
   */
  async getTop(query) {
    let criteria
    if (query.uri) {
      let uris
      // Get scheme from database
      let scheme = await this.schemeService.getSchemes(query)[0]
      if (scheme) {
        uris = [scheme.uri].concat(scheme.identifier || [])
      } else {
        uris = [query.uri]
      }
      criteria = { $or: uris.map(uri => ({ "topConceptOf.uri": uri })) }
    } else {
      // Search for all top concepts in all vocabularies
      criteria = { topConceptOf: { $exists: true } }
    }
    const concepts = await Concept.find(criteria).lean().skip(query.offset).limit(query.limit).exec()
    concepts.totalCount = await Concept.find(criteria).countDocuments()
    return concepts
  }


  /**
   * Return a Promise with an array of concepts.
   */
  async getConcepts(query) {
    let criteria = {}
    if (query.uri) {
      let uris
      // Get scheme from database
      let scheme = await this.schemeService.getSchemes(query)[0]
      if (scheme) {
        uris = [scheme.uri].concat(scheme.identifier || [])
      } else {
        uris = [query.uri]
      }
      criteria = { $or: uris.map(uri => ({ "inScheme.uri": uri })) }
    }
    const concepts = await Concept.find(criteria).lean().skip(query.offset).limit(query.limit).exec()
    concepts.totalCount = await Concept.find(criteria).countDocuments()
    return concepts
  }

  /**
   * Return a Promise with an array of concept data.
   */
  async getNarrower(query) {
    if (!query.uri) {
      return []
    }
    return await Concept.find({ broader: { $elemMatch: { uri: query.uri } } }).lean()
  }

  /**
   * Return a Promise with an array of concept data.
   */
  async getAncestors(query, root = true) {
    if (!query.uri) {
      return []
    }
    const uri = query.uri
    // First retrieve the concept object from database
    const concept = await Concept.findById(uri).lean()
    if (!concept) {
      return []
    }
    if (concept.broader && concept.broader.length) {
      // Load next parent
      let parentUri = concept.broader[0].uri
      // Temporary fix for self-referencing broader
      parentUri = parentUri == uri ? (concept.broader[1] && concept.broader[1].uri) : parentUri
      if (!parentUri) {
        if (root) {
          return []
        } else {
          return [concept]
        }
      }
      const ancestors = await this.getAncestors({ uri: parentUri }, false)
      if (root) {
        return ancestors
      } else {
        return ancestors.concat([concept])
      }
    } else if (!root) {
      return [concept]
    } else {
      return []
    }
  }

  /**
   * Return a Promise with suggestions, either in OpenSearch Suggest Format or JSKOS (?format=jskos).
   */
  async getSuggestions(query) {
    let search = query.search || ""
    let format = query.format || ""
    let results = await this.searchConcept(search, query.voc)
    if (format.toLowerCase() == "jskos") {
      // Return in JSKOS format
      return results.slice(query.offset, query.offset + query.limit)
    }
    // Transform to OpenSearch Suggest Format
    let labels = []
    let descriptions = []
    let uris = []
    let currentOffset = query.offset
    for (let result of results) {
      // Skip if offset is not reached
      if (currentOffset) {
        currentOffset -= 1
        continue
      }
      // Skip if limit is reached
      if (labels.length >= query.limit) {
        break
      }
      let prefLabel = result.prefLabel ? (result.prefLabel.de || result.prefLabel.en || "") : ""
      labels.push(result.notation[0] + " " + prefLabel) // + " (" + result.priority + ")")
      descriptions.push("")
      uris.push(result.uri)
    }
    const searchResults = [
      search, labels, descriptions, uris,
    ]
    searchResults.totalCount = results.length
    return searchResults
  }

  /**
   * Return a Promise with an array of suggestions in JSKOS format.
   */
  async search(query) {
    let search = query.query || query.search || ""
    let results = await this.searchConcept(search, query.voc)
    const searchResults = results.slice(query.offset, query.offset + query.limit)
    searchResults.totalCount = results.length
    return searchResults
  }

  async searchConcept(search, voc) {
    // Don't try to search for an empty query
    if (!search.length) {
      return []
    }
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
          $regex: "^" + search.toUpperCase(),
        },
      })
    }
    if (search.length > 1) {
      // Search _keywordsLabels
      // TODO: Rethink this approach.
      queryOr.push({ "_keywordsLabels": { $regex: "^" + search.toUpperCase() }})
    }
    // Also search for exact matches with the URI (in field _id)
    query = { $or: queryOr }
    // Filter by scheme uri
    if (voc) {
      let uris
      // Get scheme from database
      let scheme = await this.schemeService.getSchemes({ uri: voc })[0]
      if (scheme) {
        uris = [scheme.uri].concat(scheme.identifier || [])
      } else {
        uris = [query.uri]
      }
      query = { $and: [query, { $or: uris.map(uri => ({ "inScheme.uri": uri })) } ] }
    }
    let results = await Concept.find(query).lean().exec()
    let _search = search.toUpperCase()
    // Prioritize results
    for (let result of results) {
      let priority = 100
      if (result.notation && result.notation.length > 0) {
        let _notation = result.notation[0].toUpperCase()
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
          } catch(error) {
            config.log(label, error)
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
        if (b.notation[0] > a.notation[0]) {
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

}
