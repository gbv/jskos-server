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
    let limit = parseInt(query["limit"])
    if (isNaN(limit)) {
      limit = 100
    }
    return this.terminologyCollection.find({})
      .limit(limit)
      .toArray()
  }

  /**
   * Return a Promise with an array of concept data.
   */
  getDetails(query) {
    if (!query.uri) {
      return Promise.resolve([])
    }
    let uri = query.uri
    return this.conceptCollection.find({ uri: uri })
      .toArray()
  }

  /**
   * Return a Promise with an array of concept data.
   */
  getTop(query) {
    let criteria
    if (query.uri) {
      criteria = { topConceptOf: { $elemMatch: { uri: query.uri } } }
    } else {
      // Search for all top concepts in all vocabularies
      criteria = { topConceptOf: { $exists: true } }
    }
    return this.conceptCollection.find(criteria)
      .toArray()
  }

  /**
   * Return a Promise with an array of concept data.
   */
  getNarrower(query) {
    if (!query.uri) {
      return Promise.resolve([])
    }
    let uri = query.uri
    return this.conceptCollection.find({ broader: { $elemMatch: { uri: uri } } })
      .toArray()
  }

  /**
   * Return a Promise with an array of concept data.
   */
  getAncestors(query) {
    if (!query.uri) {
      return Promise.resolve([])
    }
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
          return this._getAncestors(parentUri)
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
   * Return a Promise with an array of concept data.
   */
  getSuggestions(query) {
    let search = query.search || ""
    let limit = parseInt(query["limit"])
    if (isNaN(limit)) {
      limit = 100
    }
    // TODO: - Allow filtering by scheme URI
    return this.conceptCollection.find({
      $or: [
        {
          notation: {
            $elemMatch: {
              $regex: search
            }
          }
        },
        {
          $or: [
            {
              "prefLabel.de": {
                $regex: search,
                $options: "i"
              }
            },
            {
              "prefLabel.en": {
                $regex: search,
                $options: "i"
              }
            }
          ]
        }
      ]
    })
      .toArray()
      .then(results => {
        // Prioritize results
        for (let result of results) {
          let priority = 100
          // Shorter notation equals higher priority
          priority -= result.notation[0].length
          // Notation equals search means highest priority
          if (search == result.notation[0]) {
            priority += 1000
          }
          // Notation starts with serach means higher priority
          if (result.notation[0].startsWith(search)) {
            priority += 50
          }
          // Preflabel equals search means very high priority
          for (let label of Object.values(result.prefLabel)) {
            let _label = label.toLowerCase()
            let _search = search.toLowerCase()
            if (_search == _label) {
              priority += 100
            }
            if (_label.startsWith(_search)) {
              priority += 50
            }
          }
          result.priority = priority
        }
        // Sort results by priority
        results = results.sort((a, b) => {
          return b.priority - a.priority
        })
        // Transform to OpenSearch Suggest Format
        let labels = []
        let descriptions = []
        let uris = []
        for (let result of results) {
          // Skip if limit is reached
          if (labels.length >= limit) {
            break
          }
          labels.push(result.notation[0] + " " + (result.prefLabel.de || result.prefLabel.en) + " (" + result.priority + ")")
          descriptions.push("")
          uris.push(result.uri)
        }
        return [
          search, labels, descriptions, uris
        ]
      })
  }

}

module.exports = TerminologyProvider
