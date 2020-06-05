const _ = require("lodash")
const jskos = require("jskos-tools")
const validate = require("jskos-validate")
const config = require("../config")

const Concept = require("../models/concepts")
const { MalformedBodyError, MalformedRequestError, EntityNotFoundError, InvalidBodyError, DatabaseAccessError } = require("../errors")

module.exports = class ConceptService {

  constructor(container) {
    this.schemeService = container.get(require("../services/schemes"))
  }

  /**
   * Return a Promise with an array of concept data.
   */
  async getDetails(query) {
    if (!query.uri && !query.notation) {
      return []
    }
    const uris = query.uri ? query.uri.split("|") : []
    const notations = query.notation ? query.notation.split("|") : []
    let mongoQuery = {
      $or: [].concat(uris.map(uri => ({ uri })), notations.map(notation => ({ notation }))),
    }

    if (query.voc) {
      let uris
      const scheme = await this.schemeService.getScheme(query.voc)
      if (scheme) {
        uris = [scheme.uri].concat(scheme.identifier || [])
      } else {
        uris = [query.uri]
      }
      mongoQuery["inScheme.uri"] = { $in: uris }
    }

    // Note: If query.voc is given, no schemes are returned
    const schemes = query.voc ? [] : (await Promise.all([].concat(uris, notations).map(uri => this.schemeService.getScheme(uri)))).filter(scheme => scheme != null)
    const concepts = await Concept.find(mongoQuery).lean().exec()
    const results = [].concat(schemes, concepts).slice(query.offset, query.offset + query.limit)
    results.totalCount = schemes.length + concepts.length
    return results
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
      let prefLabel = jskos.prefLabel(result, { fallbackToUri: false })
      labels.push(jskos.notation(result) + " " + prefLabel) // + " (" + result.priority + ")")
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
      let scheme = await this.schemeService.getScheme(voc)
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

  // Write endpoints start here

  async postConcept({ body, fullResult = true }) {
    if (!body) {
      throw new MalformedBodyError()
    }

    let response
    let isMultiple
    let concepts

    if (_.isArray(body)) {
      concepts = body
      isMultiple = true
    } else if (_.isObject(body)) {
      concepts = [body]
      isMultiple = false
    } else {
      throw new MalformedBodyError()
    }

    // Prepare
    let preparation = await this.prepareConcepts(concepts)
    concepts = preparation.concepts

    if (isMultiple) {
      response = await Concept.insertMany(concepts, { ordered: false, rawResult: !fullResult, lean: true })
      // TODO
      if (!fullResult) {
        response = response.ops.map(c => c.uri)
      }
    } else {
      // Throw error if necessary
      if (preparation.errors.length) {
        throw preparation.errors[0]
      }
      // Write concept to database
      let concept = concepts[0]
      // eslint-disable-next-line no-useless-catch
      try {
        concept = new Concept(concept)
        concept = await concept.save()
      } catch(error) {
        throw error
      }
      response = concept.toObject()
    }

    // ? Can we return the request without waiting for this step?
    await this.conceptPostAdjustments(preparation)

    return response
  }

  async putConcept({ body }) {
    if (!body) {
      throw new MalformedBodyError()
    }

    if (!_.isObject(body)) {
      throw new MalformedBodyError()
    }
    let concept = body

    // Prepare
    const preparation = await this.prepareConcepts([concept])

    // Throw error if necessary
    if (preparation.errors.length) {
      throw preparation.errors[0]
    }
    concept = preparation.concepts[0]

    // Write concept to database
    // eslint-disable-next-line no-useless-catch
    try {
      await Concept.replaceOne({ _id: concept.uri }, concept)
    } catch(error) {
      throw error
    }

    // ? Can we return the request without waiting for this step?
    await this.conceptPostAdjustments(preparation)

    return concept
  }

  async deleteConcept({ uri }) {
    if (!uri) {
      throw new MalformedRequestError()
    }
    const concept = await Concept.findById(uri).lean()

    if (!concept) {
      throw new EntityNotFoundError()
    }

    // TODO: conceptPostAdjustments

    const result = await Concept.deleteOne({ _id: concept._id })
    if (result.n && result.ok && result.deletedCount) {
      return
    } else {
      throw new DatabaseAccessError()
    }
  }



  async prepareConcepts(allConcepts) {
    const schemeUrisToAdjust = []
    const conceptUrisWithNarrower = []
    const concepts = []
    const errors = []
    // Load all schemes for concepts
    const schemes = await this.schemeService.getSchemes({
      uri: allConcepts
        .map(c => _.get(c, "inScheme[0].uri") || _.get(c, "topConceptOf[0].uri"))
        .filter(s => s != null)
        .join("|"),
    })
    for (let concept of allConcepts) {
      try {
        this.prepareConcept(concept, schemes)
        let scheme = _.get(concept, "inScheme[0].uri")
        if (scheme && !schemeUrisToAdjust.includes(scheme)) {
          schemeUrisToAdjust.push(scheme)
        }
        for (let broader of concept.broader || []) {
          if (!conceptUrisWithNarrower.includes(broader.uri)) {
            conceptUrisWithNarrower.push(broader.uri)
          }
        }
        concepts.push(concept)
      } catch(error) {
        errors.push(error)
      }
    }
    return {
      concepts,
      errors,
      schemeUrisToAdjust,
      conceptUrisWithNarrower,
    }
  }

  prepareConcept(concept, schemes) {
    concept._id = concept.uri
    // Add "inScheme" for all top concepts
    if (!concept.inScheme && concept.topConceptOf) {
      concept.inScheme = concept.topConceptOf
    }
    // Validate concept
    if (!validate.concept(concept)) {
      throw new InvalidBodyError()
    }
    // Check concept scheme
    const inScheme = _.get(concept, "inScheme[0]")
    const scheme = schemes.find(s => jskos.compare(s, inScheme))
    if (!scheme) {
    // Either no scheme at all or not found in database
      let message = "Error when adding concept to database: "
      if (inScheme) {
        message += `Concept scheme with URI ${inScheme.uri} is not supported.`
      } else {
        message += "Concept has no concept scheme."
      }
      throw new MalformedRequestError(message)
    }
    // Adjust URIs of schemes
    concept.inScheme[0].uri = scheme.uri
    if (concept.topConceptOf && concept.topConceptOf.length) {
      concept.topConceptOf[0].uri = scheme.uri
    }
    // Add index keywords
    concept._keywordsNotation = makePrefixes(concept.notation || [])
    // Do not write text index keywords for synthetic concepts
    if (!concept.type || !concept.type.includes("http://rdf-vocabulary.ddialliance.org/xkos#CombinedConcept")) {
    // Labels
    // Assemble all labels
      let labels = _.flattenDeep(Object.values(concept.prefLabel || {}).concat(Object.values(concept.altLabel || {})))
      // Split labels by space and dash
      concept._keywordsLabels = makeSuffixes(labels)
      // Other properties
      concept._keywordsOther = []
      for (let map of (concept.creator || []).concat(concept.scopeNote, concept.editorialNote, concept.definition)) {
        if (map) {
          concept._keywordsOther = concept._keywordsOther.concat(Object.values(map))
        }
      }
      concept._keywordsOther = _.flattenDeep(concept._keywordsOther)
    }
  }

  async conceptPostAdjustments(preparation) {
    // Adjust scheme after adding concept
    await this.schemeService.schemePostAdjustments(preparation.schemeUrisToAdjust.map(uri => ({ uri })))
    // Adjust narrower concepts if added cocept had broader prop
    for (let uri of preparation.conceptUrisWithNarrower) {
      await Concept.updateOne({ _id: uri }, { narrower: [null] })
    }
  }

}

// from https://web.archive.org/web/20170609122132/http://jam.sg/blog/efficient-partial-keyword-searches/
function makeSuffixes(values) {
  var results = []
  values.sort().reverse().forEach(function(val) {
    var tmp, hasSuffix
    for (var i=0; i<val.length-1; i++) {
      tmp = val.substr(i).toUpperCase()
      hasSuffix = results.includes(tmp)
      if (!hasSuffix) results.push(tmp)
    }
  })
  return results
}
// adapted from above
function makePrefixes(values) {
  var results = []
  values.sort().reverse().forEach(function(val) {
    var tmp, hasPrefix
    results.push(val)
    for (var i=2; i<val.length; i++) {
      tmp = val.substr(0, i).toUpperCase()
      hasPrefix = results.includes(tmp)
      if (!hasPrefix) results.push(tmp)
    }
  })
  return results
}
