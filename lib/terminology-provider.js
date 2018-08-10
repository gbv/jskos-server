const util = require("./util")

/**
 * Provide terminologies and concepts stored in a MongoDB collection.
 *
 * TODO:
 * - Improve code documentation.
 * - Add support for "properties" parameter.
 */
class TerminologyProvider {

  constructor(terminologyCollection, conceptCollection) {
    this.terminologyCollection = terminologyCollection
    this.conceptCollection = conceptCollection
  }

  /**
   * Return a Promise with an array of vocabularies.
   */
  getVocabularies(query) {
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    return this.terminologyCollection.find({}).skip(offset).limit(limit).toArray()
  }

  /**
   * Return a Promise with an array of concept data.
   */
  getDetails(query) {
    if (!query.uri) {
      return Promise.resolve([])
    }
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    let mongoQuery = {
      $or: query.uri.split("|").map(uri => ({ uri }))
    }
    return this.conceptCollection.find(mongoQuery).skip(offset).limit(limit).toArray().then(results => {
      let promises = []
      let properties = (query.properties || "").split(",")
      if (properties.includes("narrower")) {
        // Load narrower for each concept
        for (let concept of results) {
          promises.push(this._getNarrower(concept.uri).then(results => {
            concept.narrower = results
          }))
        }
      }
      if (properties.includes("ancestors")) {
        // Load ancestors for each concept
        for (let concept of results) {
          promises.push(this._getAncestors(concept.uri).then(results => {
            concept.ancestors = results
          }))
        }
      }
      return Promise.all(promises).then(() => {
        return results
      })
    })
  }

  /**
   * Return a Promise with an array of concept data.
   */
  getTop(query) {
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    let criteria
    if (query.uri) {
      criteria = { "topConceptOf.uri": query.uri }
    } else {
      // Search for all top concepts in all vocabularies
      criteria = { topConceptOf: { $exists: true } }
    }
    return this.conceptCollection.find(criteria).skip(offset).limit(limit).toArray()
  }

  /**
   * Return a Promise with an array of concept data.
   */
  getNarrower(query) {
    if (!query.uri) {
      return Promise.resolve([])
    }
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    let uri = query.uri
    return this._getNarrower(uri).then(results => {
      return results.slice(offset, offset+limit)
    })
  }

  // Internal function for getNarrower
  _getNarrower(uri) {
    return this.conceptCollection.find({ broader: { $elemMatch: { uri: uri } } }).toArray()
  }

  /**
   * Return a Promise with an array of concept data.
   */
  getAncestors(query) {
    if (!query.uri) {
      return Promise.resolve([])
    }
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    let uri = query.uri
    // First retrieve the concept object from database
    return this.conceptCollection.find({ uri: uri })
      .toArray()
      .then(result => {
        if (!result.length) {
          return Promise.resolve([])
        }
        let concept = result[0]
        if (concept.broader && concept.broader.length) {
          // Load next parent
          let parentUri = concept.broader[0].uri
          return this._getAncestors(parentUri).then(ancestors => {
            return ancestors.slice(offset, offset+limit)
          })
        } else {
          return Promise.resolve([])
        }
      })
  }

  // Internal function for getAncestors
  _getAncestors(uri) {
    return this.conceptCollection.find({ uri: uri })
      .toArray()
      .then(result => {
        if (!result.length) {
          // URI not found in database
          return Promise.resolve([])
        }
        let concept = result[0]
        if (concept.broader && concept.broader.length) {
          // Load next parent
          let parentUri = concept.broader[0].uri
          return this._getAncestors(parentUri).then(results => {
            return results.concat([concept])
          })
        } else {
          return Promise.resolve([concept])
        }
      })
  }

  /**
   * Return a Promise with suggestions, either in OpenSearch Suggest Format or JSKOS (?format=jskos).
   */
  getSuggestions(req, res) {
    let query = req.query
    let search = query.search || ""
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    let format = query.format || ""
    return this.searchConcept(search).then(results => {
      if (format.toLowerCase() == "jskos") {
        // Return in JSKOS format
        return results.slice(offset, offset+limit)
      }
      // Transform to OpenSearch Suggest Format
      let labels = []
      let descriptions = []
      let uris = []
      let currentOffset = offset
      for (let result of results) {
        // Skip if offset is not reached
        if (currentOffset) {
          currentOffset -= 1
          continue
        }
        // Skip if limit is reached
        if (labels.length >= limit) {
          break
        }
        let prefLabel = result.prefLabel ? (result.prefLabel.de || result.prefLabel.en || "") : ""
        labels.push(result.notation[0] + " " + prefLabel) // + " (" + result.priority + ")")
        descriptions.push("")
        uris.push(result.uri)
      }
      // Add headers
      util.setPaginationHeaders({
        req,
        res,
        limit,
        offset,
        total: results.length
      })
      return [
        search, labels, descriptions, uris
      ]
    }).catch(error => {
      console.log("Error in getSuggestion:", error)
      return []
    })
  }

  /**
   * Return a Promise with an array of suggestions in JSKOS format.
   */
  search(req, res) {
    let query = req.query
    let search = query.query || query.search || ""
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    return this.searchConcept(search).then(results => {
      // Add headers
      util.setPaginationHeaders({
        req,
        res,
        limit,
        offset,
        total: results.length
      })
      return results.slice(offset, offset+limit)
    }).catch(error => {
      console.log(error)
      return []
    })
  }

  searchConcept(search) {
    console.log("search for", search)
    // Don't try to search for an empty query
    if (!search.length) {
      return Promise.resolve([])
    }
    let timeStarted = new Date().getTime()
    let query
    // let projectAndSort = {}
    if (search.length > 2) {
      // Use text search for queries longer than two characters
      query = {
        $text: {
          $search: "\"" + search + "\""
        }
      }
      // Projekt and sort on text score
      // projectAndSort = { score: { $meta: "textScore" } }
    } else {
      // Search for notations specifically for one or two characters
      query = {
        _keywordsNotation: {
          $regex: "^" + search.toUpperCase()
        }
      }
    }
    // Also search for exact matches with the URI (in field _id)
    query = { $or: [query, { _id: search }] }
    // TODO: - Allow filtering by scheme URI
    return this.conceptCollection.find(query)
      // .project(projectAndSort) // FIXME: Either test more and include, or remove completely
      // .sort(projectAndSort)
      // .limit(20000)
      .toArray()
      .then(results => {
        let timePassed = (new Date().getTime() - timeStarted) / 1000
        console.log(search, ":Query took", timePassed, "seconds with count", results.length)
        timeStarted = new Date().getTime()
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
          for (let [labelType, factor] of [["prefLabel", 2.0], ["altLabel", 1.0]]) {
            let labels = []
            // Collect all labels
            for (let label of Object.values(result[labelType] || {})) {
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
                console.log(label, error)
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
        timePassed = (new Date().getTime() - timeStarted) / 1000
        console.log(search, ":Post-query took", timePassed, "seconds.")
        return results
      }).catch(error => {
        console.log("Error in searchConcept:", error)
        return []
      })
  }

}

module.exports = TerminologyProvider
