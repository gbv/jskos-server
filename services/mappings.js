const _ = require("lodash")
const utils = require("../utils")
const config = require("../config")
const jskos = require("jskos-tools")
const validate = require("jskos-validate")
const escapeStringRegexp = require("escape-string-regexp")

const Mapping = require("../models/mappings")
const Annotation = require("../models/annotations")
const { MalformedBodyError, MalformedRequestError, EntityNotFoundError, InvalidBodyError, DatabaseAccessError, CreatorDoesNotMatchError } = require("../errors")

module.exports = class MappingService {

  constructor(container) {
    this.schemeService = container.get(require("../services/schemes"))

    this.loadWhitelists()
  }

  /**
   * Loads all schemes from whitelists (if they exists) from the database.
   */
  async loadWhitelists() {
    // Load schemes from fromSchemeWhitelist and toSchemeWhitelist
    for (let type of ["fromSchemeWhitelist", "toSchemeWhitelist"]) {
      let whitelist = []
      for (let scheme of config.mappings[type] || []) {
        scheme = (await this.schemeService.getScheme(scheme.uri)) || scheme
        whitelist.push(scheme)
      }
      if (whitelist.length) {
        this[type] = whitelist
      }
    }
  }

  /**
   * Checks a mapping againgst scheme whitelists and throws an error if it doesn't match.
   *
   * @param {*} mapping
   */
  checkWhitelists(mapping) {
    for (let type of ["fromScheme", "toScheme"]) {
      const whitelist = this[`${type}Whitelist`]
      const scheme = mapping[type]
      if (whitelist && scheme) {
        if (!whitelist.find(s => jskos.compare(s, scheme))) {
          throw new InvalidBodyError(`Value in ${type} is not allowed.`)
        }
      }
    }
  }

  async getMappings({ uri, identifier, from, to, fromScheme, toScheme, mode, direction, type, partOf, creator, sort, order, limit, offset, download, annotatedWith, annotatedFor, annotatedBy }) {
    direction = direction || "forward"

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
    var criteria = ["from", "to"].filter(uri => ({ from, to }[uri])).map(part => {
      count = direction == "both" ? 2 : 1
      let or = []
      while (count > 0) {
        let side = fromTo(part)
        for (let searchString of { from, to }[part].split("|")) {
          or.push({
            [`${side}.memberSet.uri`]: regex(searchString),
          })
          or.push({
            [`${side}.memberChoice.uri`]: regex(searchString),
          })
          or.push({
            [`${side}.memberSet.notation`]: regex(searchString),
          })
          or.push({
            [`${side}.memberChoice.notation`]: regex(searchString),
          })
        }
      }
      return { $or: or }
    })
    if (identifier) {
      // Add identifier to criteria
      criteria.push({ $or: identifier.split("|").map(id => ({ $or: [{ identifier: id }, { uri: id }] })) })
    }
    if (uri) {
      // Add URI to criteria
      criteria.push({ $or: uri.split("|").map(id => ({uri: id})) })
    }
    // Note: This should only be applied to "from" and "to", not to future parameters like "fromScheme" or "toScheme".
    if (!["and", "or"].includes(mode)) {
      mode = "and"
    }
    let mongoQuery1 = criteria.length ? { [`$${mode}`]: criteria } : {}

    // fromScheme / toScheme
    let fromToScheme = { fromScheme, toScheme }
    for (let part of ["fromScheme", "toScheme"]) {
      // Replace query.fromScheme and query.toScheme with array of URIs
      if (fromToScheme[part]) {
        // load scheme from database
        let searchStrings = fromToScheme[part].split("|")
        let allUris = []
        for (let search of searchStrings) {
          let scheme = await this.schemeService.getScheme(search)
          let uris
          if (!scheme) {
            uris = [search]
          } else {
            uris = [scheme.uri].concat(scheme.identifier || [])
          }
          allUris = allUris.concat(uris)
        }
        fromToScheme[part] = allUris.length ? allUris : null
      }
    }
    criteria = ["from", "to"].filter(uri => fromToScheme[uri + "Scheme"]).map(part => {
      // reset count
      count = direction == "both" ? 2 : 1
      let or = []
      while (count > 0) {
        let fromToPart = fromTo(part)
        for (let uri of fromToScheme[part + "Scheme"]) {
          or.push({ [`${fromToPart}Scheme.uri`]: uri })
          or.push({ [`${fromToPart}Scheme.notation`]: uri })
        }
      }
      return { $or: or }
    })

    let mongoQuery2 = criteria.length ? { $and: criteria } : {}

    // Type
    criteria = []
    if (type) {
      for (let t of type.split("|")) {
        criteria.push({
          type: t,
        })
        // FIXME: Replace with default type from jskos-tools (does not exist yet).
        if (t == "http://www.w3.org/2004/02/skos/core#mappingRelation") {
          criteria.push({
            type: { $exists: false },
          })
        }
      }
    }
    let mongoQuery3 = criteria.length ? { $or: criteria } : {}

    // Concordances
    let mongoQuery4 = {}
    if (partOf) {
      let uris = partOf.split("|")
      mongoQuery4 = {
        $or: uris.map(uri => ({ "partOf.uri": uri })),
      }
    }

    // Concordances
    let mongoQuery5 = {}
    if (creator) {
      let creators = creator.split("|")
      mongoQuery4 = {
        $or: _.flatten(creators.map(creator => [{ "creator.prefLabel.de": creator }, { "creator.prefLabel.en": creator }, { "creator.uri": creator }])),
      }
    }

    const query = { $and: [mongoQuery1, mongoQuery2, mongoQuery3, mongoQuery4, mongoQuery5] }

    // Sorting (default: modified descending)
    sort = ["created", "modified"].includes(sort) ? sort : "modified"
    order = order == "asc" ? 1 : -1
    // Currently default sort by modified descending
    const sorting = { [sort]: order }

    let pipeline = []
    let model = Mapping

    // Filter by annotations
    // Three different paths
    // 1. No filter by annotations
    if (!annotatedWith && !annotatedBy && !annotatedFor) {
      // Simply match mapping query
      pipeline.push({ $match: query })
    }
    // 2. Filter by annotation, and from/to/creator is defined
    else if (from || to || creator) {
      // We'll first filter the mappings, then add annotations and filter by those
      const annotationQuery = {}
      if (annotatedWith) {
        annotationQuery["annotations.bodyValue"] = annotatedWith
      }
      if (annotatedFor) {
        annotationQuery["annotations.motivation"] = annotatedFor
      }
      if (annotatedBy) {
        annotationQuery["annotations.creator.id"] = { $in: annotatedBy.split("|") }
      }
      pipeline = [
        { $match: query },
        {
          $lookup: {
            from: "annotations",
            localField: "uri",
            foreignField: "target",
            as: "annotations",
          },
        },
        {
          $match: annotationQuery,
        },
        { $unset: "annotations" },
      ]
    }
    // 3. Filter by annotation, and none of the properties is given
    else {
      // We'll first filter the annotations, then get the associated mappings, remove duplicates, and filter those
      model = Annotation
      const annotationQuery = {}
      if (annotatedWith) {
        annotationQuery["bodyValue"] = annotatedWith
      }
      if (annotatedFor) {
        annotationQuery["motivation"] = annotatedFor
      }
      if (annotatedBy) {
        annotationQuery["creator.id"] = { $in: annotatedBy.split("|") }
      }
      pipeline = [
        // First, match annotations
        {
          $match: annotationQuery,
        },
        // Get mappings for annotations
        {
          $lookup: {
            from: "mappings",
            localField: "target",
            foreignField: "uri",
            as: "mappings",
          },
        },
        // Unwind and replace root
        { $unwind: "$mappings" },
        { $replaceRoot: { newRoot: "$mappings" } },
        // Filter duplicates by grouping by _id and getting only the first element
        { $group: { _id: "$_id", data: { $push: "$$ROOT" } } },
        { $addFields: { mapping: { $arrayElemAt: ["$data", 0] } } },
        // Replace root with mapping
        { $replaceRoot: { newRoot: "$mapping" } },
        // Match mappings
        { $match: query },
      ]
    }

    if (download) {
      // For a download, return a stream
      return model.aggregate(pipeline).cursor().exec()
    } else {
      // Otherwise, return results
      const mappings = await model.aggregate(pipeline).sort(sorting).skip(offset).limit(limit).exec()
      mappings.totalCount = _.get(await model.aggregate(pipeline).count("count").exec(), "[0].count", 0)
      return mappings
    }
  }

  /**
   * Returns a promise with a single mapping with ObjectId in req.params._id.
   */
  async getMapping(_id) {
    if (!_id) {
      throw new MalformedRequestError()
    }
    const result = await Mapping.findById(_id).lean()
    if (!result) {
      throw new EntityNotFoundError(null, _id)
    }
    return result
  }

  /**
   * Save a single mapping or multiple mappings in the database. Adds created date, validates the mapping, and adds identifiers.
   *
   * TODO: Make sure user matches?
   */
  async postMapping({ bodyStream, bulk = false }) {
    if (!bodyStream) {
      throw new MalformedBodyError()
    }

    let isMultiple = true

    // As a workaround, build body from bodyStream
    // TODO: Use actual stream
    let mappings = await new Promise((resolve) => {
      const body = []
      bodyStream.on("data", mapping => {
        body.push(mapping)
      })
      bodyStream.on("isSingleObject", () => {
        isMultiple = false
      })
      bodyStream.on("end", () => {
        resolve(body)
      })
    })

    let response

    // Ignore bulk option for single object
    bulk = !isMultiple ? false : bulk

    // Adjust all mappings
    mappings = mappings.map(mapping => {
      try {
        // Add created and modified dates.
        const now = (new Date()).toISOString()
        if (!mapping.created) {
          mapping.created = now
        }
        mapping.modified = now
        // Validate mapping
        if (!validate.mapping(mapping)) {
          throw new InvalidBodyError()
        }
        if (mapping.partOf) {
          throw new InvalidBodyError("Property `partOf` is currently not allow.")
        }
        // Check cardinality for 1-to-1
        if (config.mappings.cardinality == "1-to-1" && jskos.conceptsOfMapping(mapping, "to").length > 1) {
          throw new InvalidBodyError("Only 1-to-1 mappings are supported.")
        }
        this.checkWhitelists(mapping)
        // _id and URI
        delete mapping._id
        let uriBase = config.baseUrl + "mappings/"
        if (mapping.uri) {
          let uri = mapping.uri
          // URI already exists, use if it's valid, otherwise move to identifier
          if (uri.startsWith(uriBase) && utils.isValidUuid(uri.slice(uriBase.length, uri.length))) {
            mapping._id = uri.slice(uriBase.length, uri.length)
          } else {
            mapping.identifier = (mapping.identifier || []).concat([uri])
          }
        }
        if (!mapping._id) {
          mapping._id = utils.uuid()
          mapping.uri = uriBase + mapping._id
        }
        // Make sure URI is a https URI when in production
        if (config.env === "production") {
          mapping.uri.replace("http:", "https:")
        }
        // Set mapping identifier
        mapping.identifier = jskos.addMappingIdentifiers(mapping).identifier

        return mapping
      } catch(error) {
        if (bulk) {
          return null
        }
        throw error
      }
    })
    mappings = mappings.filter(m => m)

    if (bulk) {
      // Use bulkWrite for most efficiency
      mappings.length && await Mapping.bulkWrite(mappings.map(m => ({
        replaceOne: {
          filter: { _id: m._id },
          replacement: m,
          upsert: true,
        },
      })))
      response = mappings.map(c => ({ uri: c.uri }))
    } else {
      response = await Mapping.insertMany(mappings, { lean: true })
    }

    return isMultiple ? response : response[0]
  }

  async putMapping({ _id, body, user }) {
    let mapping = body
    if (!mapping) {
      throw new InvalidBodyError()
    }
    // Add modified date.
    mapping.modified = (new Date()).toISOString()
    // Validate mapping
    if (!validate.mapping(mapping)) {
      throw new InvalidBodyError()
    }
    if (mapping.partOf) {
      throw new InvalidBodyError("Property `partOf` is currently not allow.")
    }
    if (config.mappings.cardinality == "1-to-1" && jskos.conceptsOfMapping(mapping, "to").length > 1) {
      throw new InvalidBodyError("Only 1-to-1 mappings are supported.")
    }
    this.checkWhitelists(mapping)

    // Replace current mapping in database
    const existingMapping = await this.getMapping(_id)

    // Check if authorized user matches creator
    if (!utils.matchesCreator(user, existingMapping, "mappings", "update")) {
      throw new CreatorDoesNotMatchError()
    }
    // Override _id and uri properties
    mapping._id = existingMapping._id
    mapping.uri = existingMapping.uri

    const result = await Mapping.replaceOne({ _id: existingMapping._id }, mapping)
    if (result.n && result.ok) {
      return mapping
    } else {
      throw new DatabaseAccessError()
    }
  }

  async patchMapping({ _id, body, user }) {
    let mapping = body
    if (!mapping) {
      throw new InvalidBodyError()
    }
    // Add modified date.
    mapping.modified = (new Date()).toISOString()

    // Adjust current mapping in database
    const existingMapping = await this.getMapping(_id)

    // Check if authorized user matches creator
    if (!utils.matchesCreator(user, existingMapping, "mappings", "update")) {
      throw new CreatorDoesNotMatchError()
    }

    _.unset(mapping, "_id")
    _.unset(mapping, "uri")
    // Use lodash merge to merge mappings
    _.merge(existingMapping, mapping)

    // Validate mapping after merge
    if (!validate.mapping(existingMapping)) {
      throw new InvalidBodyError()
    }
    if (mapping.partOf) {
      throw new InvalidBodyError("Property `partOf` is currently not allow.")
    }
    if (config.mappings.cardinality == "1-to-1" && jskos.conceptsOfMapping(mapping, "to").length > 1) {
      throw new InvalidBodyError("Only 1-to-1 mappings are supported.")
    }
    this.checkWhitelists(mapping)

    const result = await Mapping.replaceOne({ _id: existingMapping._id }, existingMapping)
    if (result.ok) {
      return existingMapping
    } else {
      throw new DatabaseAccessError()
    }
  }

  async deleteMapping({ uri, user }) {
    const existingMapping = await this.getMapping(uri)

    if (!utils.matchesCreator(user, existingMapping, "mappings", "delete")) {
      throw new CreatorDoesNotMatchError()
    }

    const result = await Mapping.deleteOne({ _id: existingMapping._id })
    if (result.n && result.ok && result.deletedCount) {
      return
    } else {
      throw new DatabaseAccessError()
    }
  }

  /**
   * Returns a promise with an array of concept schemes.
   */
  async getMappingSchemes(query) {
    // TODO: Optimize MongoDB queries
    let match = []
    if (query.from) {
      match.push({
        $or: [{
          "from.memberSet.uri": query.from,
        }, {
          "from.memberSet.notation": query.from,
        }],
      })
    }
    if (query.to) {
      match.push({
        $or: [{
          "to.memberSet.uri": query.to,
        }, {
          "to.memberSet.notation": query.to,
        },{
          "to.memberChoice.uri": query.to,
        }, {
          "to.memberChoice.notation": query.to,
        }],
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
      Mapping.aggregate([
        match,
        {
          $group: {
            _id: "$fromScheme",
            "count": { "$sum": 1 },
          },
        },
      ]).exec(),
      Mapping.aggregate([
        match,
        {
          $group: {
            _id: "$toScheme",
            "count": { "$sum": 1 },
          },
        },
      ]).exec(),
    ]
    let schemes = {}
    let results = await Promise.all(promises)
    for (let result of results[0]) {
      // fromScheme counts
      schemes[result._id.uri] = result._id
      schemes[result._id.uri].fromCount = parseInt(result.count) || 0
    }
    for (let result of results[1]) {
      // toScheme counts
      if (!result._id || !result._id.uri) {
        continue
      }
      schemes[result._id.uri] = schemes[result._id.uri] || result._id
      schemes[result._id.uri].toCount = parseInt(result.count) || 0
    }
    const toBeReturned = Object.values(schemes).slice(query.offset, query.offset + query.limit)
    toBeReturned.totalCount = Object.values(schemes).length
    return toBeReturned
  }

  /**
   * Returns a promise with suggestions in OpenSearch Suggest Format
   */
  async getNotationSuggestions(query) {
    let search = query.search
    if (!search || search.length == 0) {
      return ["", [], [], []]
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
    let mappings = await Mapping.find(mongoQuery).lean().exec()
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
    let unzippedResults = _.unzip(zippedResults.slice(query.offset, query.offset + query.limit))
    const toBeReturned = [
      search,
      unzippedResults[0] || [],
      unzippedResults[1] || [],
      [],
    ]
    toBeReturned.totalCount = zippedResults.length
    return toBeReturned
  }

  async createIndexes() {
    const indexes = []
    for (let path of ["from.memberSet", "from.memberList", "from.memberChoice", "to.memberSet", "to.memberList", "to.memberChoice", "fromScheme", "toScheme"]) {
      for (let type of ["notation", "uri"]) {
        indexes.push([{ [`${path}.${type}`]: 1 }, {}])
      }
    }
    // Separately create multi-indexes for fromScheme/toScheme
    indexes.push([{
      "fromScheme.uri": 1,
      "toScheme.uri": 1,
    }, {}])
    indexes.push([{ "uri": 1 }, {}])
    indexes.push([{ "identifier": 1 }, {}])
    indexes.push([{ "type": 1 }, {}])
    indexes.push([{ "created": 1 }, {}])
    indexes.push([{ "modified": 1 }, {}])
    indexes.push([{ "partOf.uri": 1 }, {}])
    indexes.push([{ "creator.uri": 1 }, {}])
    indexes.push([{ "creator.prefLabel.de": 1 }, {}])
    indexes.push([{ "creator.prefLabel.en": 1 }, {}])
    // Create collection if necessary
    try {
      await Mapping.createCollection()
    } catch (error) {
      // Ignore error
    }
    // Drop existing indexes
    await Mapping.collection.dropIndexes()
    for (let [index, options] of indexes) {
      await Mapping.collection.createIndex(index, options)
    }
  }

}
