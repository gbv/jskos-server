const _ = require("lodash")
const util = require("./util")
const config = require("../config")
const jskos = require("jskos-tools")
const validate = require("jskos-validate")
const escapeStringRegexp = require("escape-string-regexp")

/**
 * Provide Mappings stored in a MongoDB collection.
 */
class MappingProvider {

  constructor(collection, concordanceCollection, terminologyCollection) {
    this.collection = collection
    this.concordanceCollection = concordanceCollection
    this.terminologyCollection = terminologyCollection
  }

  /**
   * Return a Promise with an array of concordances.
   */
  getConcordances(req, res) {
    let query = req.query
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    let conditions = []
    // Search by URI
    if (query.uri) {
      conditions.push({ $or: query.uri.split("|").map(uri => ({ "uri": uri })) })
    }
    // Search by fromScheme (URI or notation)
    if (query.fromScheme) {
      conditions.push({ $or: [
        { $or: query.fromScheme.split("|").map(fromScheme => ({ "fromScheme.uri": fromScheme })) },
        { $or: query.fromScheme.split("|").map(fromScheme => ({ "fromScheme.notation": fromScheme })) },
      ] })
    }
    // Search by toScheme (URI or notation)
    if (query.toScheme) {
      conditions.push({ $or: [
        { $or: query.toScheme.split("|").map(toScheme => ({ "toScheme.uri": toScheme })) },
        { $or: query.toScheme.split("|").map(toScheme => ({ "toScheme.notation": toScheme })) }
      ] })
    }
    // Search by creator
    if (query.creator) {
      let or = []
      for (let creator of query.creator.split("|")) {
        or.push({ "creator.prefLabel.de": creator })
        or.push({ "creator.prefLabel.en": creator })
      }
      if (or.length) {
        conditions.push({ $or: or })
      }
    }
    // Set mode
    let mode = query.mode
    if (!["and", "or"].includes(mode)) {
      mode = "and"
    }
    let cursor =  this.concordanceCollection.find(conditions.length ? { [`$${mode}`]: conditions } : {})
    return cursor.count().then(total => {
      if (query.download) {
        // For a download, just return the cursor.
        return cursor
      } else {
        // Add headers
        util.setPaginationHeaders({ req, res, limit, offset, total })
        return cursor.skip(offset).limit(limit).toArray()
      }
    })
  }

  /**
   * Return a Promise with an array of mappings.
   */
  async getMappings(req, res) {
    let query = req.query
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    let direction = query.direction || "forward"
    let count = 0
    let fromTo = fromTo => {
      let result
      if (count == 1) {
        result = fromTo == "from" && direction == "backward" || fromTo == "to" && direction != "backward" ? "to" : "from"
      } else if (count <= 0) {
        return null
      } else {
        result = fromTo == "from" ? "to" : "from"
      }
      count -= 1
      return result
    }
    // Converts value to regex object for MongoDB if it ends with `*`.
    // Currently only supports truncated search like that, no arbitrary regex possible.
    const regex = value => {
      if (value.endsWith("*")) {
        return { $regex: `^${escapeStringRegexp(value.substring(0, value.length - 1))}` }
      } else {
        return value
      }
    }
    var criteria = ["from", "to"].filter(uri => query[uri]).map(part => {
      count = direction == "both" ? 2 : 1
      let or = []
      while (count > 0) {
        let set = {}, choice = {}
        let side = fromTo(part)
        if (query[part].startsWith("http")) {
          set[`${side}.memberSet.uri`] = regex(query[part])
          choice[`${side}.memberChoice.uri`] = regex(query[part])
        } else {
          set[`${side}.memberSet.notation`] = regex(query[part])
          choice[`${side}.memberChoice.notation`] = regex(query[part])
        }
        or.push(set, choice)
      }
      return { $or: or }
    })
    if (query.identifier) {
      // Add identifier to criteria
      criteria.push({ $or: query.identifier.split("|").map(id => ({ $or: [{ identifier: id }, { uri: id }] })) })
    }
    if (query.uri) {
      // Add URI to criteria
      criteria.push({ $or: query.uri.split("|").map(id => ({uri: id})) })
    }
    // Note: This should only be applied to "from" and "to", not to future parameters like "fromScheme" or "toScheme".
    let mode = query.mode
    if (!["and", "or"].includes(mode)) {
      mode = "and"
    }
    let mongoQuery1 = criteria.length ? { [`$${mode}`]: criteria } : {}

    // fromScheme / toScheme
    for (let part of ["fromScheme", "toScheme"]) {
      // Replace query.fromScheme and query.toScheme with array of URIs
      if (query[part]) {
        // load scheme from database
        let search = decodeURIComponent(query[part])
        let scheme = await this.terminologyCollection.findOne({ $or: [{ uri: search }, { identifier: search }, { notation: new RegExp(`^${search}$`, "i") }]})
        let uris
        if (!scheme) {
          uris = [search]
        } else {
          uris = [scheme.uri].concat(scheme.identifier || [])
        }
        query[part] = uris.length ? uris : null
      }
    }
    criteria = ["from", "to"].filter(uri => query[uri + "Scheme"]).map(part => {
      // reset count
      count = direction == "both" ? 2 : 1
      let or = []
      while (count > 0) {
        let fromToPart = fromTo(part)
        for (let uri of query[part + "Scheme"]) {
          let scheme = {}
          if (uri.startsWith("http")) {
            scheme[`${fromToPart}Scheme.uri`] = uri
          } else {
            scheme[`${fromToPart}Scheme.notation`] = uri
          }
          or.push(scheme)
        }
      }
      return { $or: or }
    })

    let mongoQuery2 = criteria.length ? { $and: criteria } : {}

    // Type
    let mongoQuery3 = {}
    if (query.type) {
      // FIXME: Replace with default type from jskos-tools (does not exist yet).
      if (query.type == "http://www.w3.org/2004/02/skos/core#mappingRelation") {
        mongoQuery3 = {
          $or: [
            {
              type: query.type
            },
            {
              type: { $exists: false }
            }
          ]
        }
      } else {
        mongoQuery3 = {
          type: query.type
        }
      }
    }

    // Concordances
    let mongoQuery4 = {}
    if (query.partOf) {
      let uris = query.partOf.split("|")
      mongoQuery4 = {
        $or: uris.map(uri => ({ "partOf.uri": uri }))
      }
    }

    // Concordances
    let mongoQuery5 = {}
    if (query.creator) {
      let creators = query.creator.split("|")
      mongoQuery4 = {
        $or: _.flatten(creators.map(creator => [{ "creator.prefLabel.de": creator }, { "creator.prefLabel.en": creator }, { "creator.uri": creator }]))
      }
    }

    // Sorting
    // Currently default sort by modified descending
    let sorting = { modified: -1 }

    let cursor =  this.collection.find({ $and: [mongoQuery1, mongoQuery2, mongoQuery3, mongoQuery4, mongoQuery5] }).sort(sorting)
    return cursor.count().then(total => {
      if (query.download) {
        // For a download, just return the cursor.
        return cursor
      } else {
        // Add headers
        util.setPaginationHeaders({ req, res, limit, offset, total })
        return cursor.skip(offset).limit(limit).toArray()
      }
    })
  }

  /**
   * Returns a promise with a single mapping with ObjectId in req.params._id.
   */
  getMapping(req) {
    let _id = req.params._id
    if (!_id) {
      return Promise.resolve(null)
    }
    return this.collection.findOne({ _id })
  }

  /**
   * Save a single mapping in the database. Adds created date, validates tge mapping, and adds identifiers.
   */
  saveMapping(req) {
    let mapping = req.body
    if (!mapping) {
      return Promise.resolve(null)
    }
    // Add created and modified dates.
    let date = (new Date()).toISOString()
    if (!mapping.created) {
      mapping.created = date
    }
    if (!mapping.modified) {
      mapping.modified = mapping.created
    }
    // Validate mapping
    let valid = validate.mapping(mapping)
    if (mapping.partOf) {
      valid = false
      // TODO: Return reason with error
    }
    if (!valid) {
      // TODO: Return error 422
      return Promise.resolve(null)
    }
    // Add mapping identifier
    mapping = jskos.addMappingIdentifiers(mapping)
    // _id and URI
    delete mapping._id
    let uriBase = util.getBaseUrl(req) + "mappings/"
    if (mapping.uri) {
      let uri = mapping.uri
      // URI already exists, use if it's valid, otherwise move to identifier
      if (uri.startsWith(uriBase) && util.isValidUuid(uri.slice(uriBase.length, uri.length))) {
        mapping._id = uri.slice(uriBase.length, uri.length)
      } else {
        mapping.identifier = (mapping.identifier || []).concat([uri])
      }
    }
    if (!mapping._id) {
      mapping._id = util.uuid()
      mapping.uri = uriBase + mapping._id
    }
    // Make sure URI is a https URI (except in tests)
    if (!config.env == "test") {
      mapping.uri.replace("http:", "https:")
    }
    // Save mapping
    return this.collection.insertOne(mapping)
      .then(() => {
        return mapping
      })
      .catch(error => {
        console.log(error)
        return null
      })
  }

  putMapping(req, res) {
    let mapping = req.body
    if (!mapping) {
      return Promise.resolve(null)
    }
    // Add modified date.
    let date = (new Date()).toISOString()
    mapping.modified = date
    // Validate mapping
    let valid = validate.mapping(mapping)
    if (mapping.partOf) {
      valid = false
      // TODO: Return reason with error
    }
    if (!valid) {
      // TODO: Return error 422
      return Promise.resolve(null)
    }
    // Add mapping identifier
    mapping = jskos.addMappingIdentifiers(mapping)
    // Replace current mapping in database
    return this.getMapping(req).then(existingMapping => {
      if (!existingMapping) {
        return null
      }
      // Check if authorized user matches creator
      if (!util.matchesCreator(req.user, existingMapping)) {
        res.sendStatus(403)
        return null
      }
      // TODO: - Should creator be overridden here?
      mapping._id = existingMapping._id
      mapping.uri = existingMapping.uri
      return this.collection.replaceOne({ _id: existingMapping._id }, mapping).then(result => {
        if (result.result.n && result.result.ok) {
          return mapping
        } else {
          return null
        }
      })
    })
  }

  patchMapping(req, res) {
    let mapping = req.body
    if (!mapping) {
      return Promise.resolve(null)
    }
    // Add modified date.
    let date = (new Date()).toISOString()
    mapping.modified = date
    // Add mapping identifier
    mapping = jskos.addMappingIdentifiers(mapping)
    // Adjust current mapping in database
    return this.getMapping(req).then(existingMapping => {
      if (!existingMapping) {
        return null
      }
      // Check if authorized user matches creator
      if (!util.matchesCreator(req.user, existingMapping)) {
        res.sendStatus(403)
        return null
      }
      // TODO: - Should creator be overridden here?
      _.unset(mapping, "_id")
      _.unset(mapping, "uri")
      // Use lodash merge to merge mappings
      _.merge(existingMapping, mapping)
      // Validate mapping after merge
      let valid = validate.mapping(existingMapping)
      if (mapping.partOf) {
        valid = false
        // TODO: Return reason with error
      }
      if (!valid) {
        // TODO: Return error 422
        return Promise.resolve(null)
      }
      return this.collection.replaceOne({ _id: existingMapping._id }, existingMapping).then(result => result.result.ok ? existingMapping : null)
    })
  }

  deleteMapping(req, res) {
    let _id = req.params._id
    if (!_id) {
      return Promise.resolve(false)
    }
    return this.getMapping(req).then(existingMapping => {
      if (!existingMapping) {
        return false
      }
      // Check if authorized user matches creator
      if (!util.matchesCreator(req.user, existingMapping)) {
        res.sendStatus(403)
        return false
      }
      return this.collection.deleteOne({ _id }).then(result => {
        if (result.result.n && result.result.ok) {
          return true
        } else {
          return false
        }
      })
    })
  }

  /**
   * Returns a promise with an array of concept schemes.
   */
  getMappingSchemes(req, res) {
    let query = req.query
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    // TODO: Optimize MongoDB queries
    let match = []
    if (query.from) {
      match.push({
        $or: [{
          "from.memberSet.uri": query.from
        }, {
          "from.memberSet.notation": query.from
        }]
      })
    }
    if (query.to) {
      match.push({
        $or: [{
          "to.memberSet.uri": query.to
        }, {
          "to.memberSet.notation": query.to
        },{
          "to.memberChoice.uri": query.to
        }, {
          "to.memberChoice.notation": query.to
        }]
      })
    }
    if (!match.length) {
      match = [{}]
    }
    let mode = query.mode
    if (!["and", "or"].includes(mode)) {
      // default: $or
      mode = "or"
    }
    match = { $match: { [`$${mode}`]: match } }
    let promises = [
      this.collection.aggregate([
        match,
        {
          $group: {
            _id: "$fromScheme",
            "count": { "$sum": 1 }
          }
        }
      ]).toArray(),
      this.collection.aggregate([
        match,
        {
          $group: {
            _id: "$toScheme",
            "count": { "$sum": 1 }
          }
        }
      ]).toArray()
    ]
    let schemes = {}
    return Promise.all(promises).then(results => {
      for (let result of results[0]) {
        // fromScheme counts
        schemes[result._id.uri] = result._id
        schemes[result._id.uri].fromCount = parseInt(result.count) || 0
      }
      for (let result of results[1]) {
        // toScheme counts
        schemes[result._id.uri] = schemes[result._id.uri] || result._id
        schemes[result._id.uri].toCount = parseInt(result.count) || 0
      }
      // Add headers
      util.setPaginationHeaders({ req, res, limit, offset, total: Object.values(schemes).length })
      return Object.values(schemes).slice(offset, offset+limit)
    })
  }

  /**
   * Returns a promise with suggestions in OpenSearch Suggest Format
   */
  getNotationSuggestions(req, res) {
    let query = req.query
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    let search = query.search
    if (!search || search.length == 0) {
      return Promise.resolve(["", [], [], []])
    }
    let vocs = query.voc && query.voc.split("|")
    let mongoQuery, and = [], or = []
    // Scheme restrictions
    // FIXME: Currently, this allows the scheme to be anywhere in the mapping.
    // Restrict it to the side where the notation is searched.
    if (vocs && vocs.length) {
      let vocOr = []
      for (let voc of vocs) {
        vocOr.push({ "fromScheme.uri": voc })
        vocOr.push({ "fromScheme.notation": voc })
        vocOr.push({ "toScheme.uri": voc })
        vocOr.push({ "toScheme.notation": voc })
      }
      and.push({ $or: vocOr })
    }
    // Notations
    // TODO: - Implement mode.
    let paths = ["from.memberSet", "to.memberSet", "to.memberList", "to.memberChoice"]
    for (let path of paths) {
      or.push({ [path + ".notation"]: { $regex: `^${search}` } })
    }
    and.push({ $or: or })
    mongoQuery = { $and: and }
    return this.collection.find(mongoQuery).toArray().then(mappings => {
      let results = []
      let descriptions = []
      for (let mapping of mappings) {
        for (let path of paths) {
          let concepts = _.get(mapping, path, null)
          if (!concepts) continue
          let notations = []
          for (let concept of concepts) {
            notations = notations.concat(concept.notation)
          }
          for (let notation of notations) {
            if (_.lowerCase(notation).startsWith(_.lowerCase(search))) {
              let index = results.indexOf(notation)
              if (index == -1) {
                results.push(notation)
                descriptions.push(1)
              } else {
                descriptions[index] += 1
              }
            }
          }
        }
      }
      let zippedResults = _.zip(results, descriptions)
      zippedResults.sort((a, b) => {
        return b[1] - a[1] || a[0] > b[0]
      })
      // Add headers
      util.setPaginationHeaders({ req, res, limit, offset, total: zippedResults.length })
      let unzippedResults = _.unzip(zippedResults.slice(offset, offset+limit))
      return [
        search,
        unzippedResults[0] || [],
        unzippedResults[1] || [],
        []
      ]
    })
  }
}

module.exports = MappingProvider
