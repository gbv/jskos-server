const _ = require("lodash")
const utils = require("../utils")
const config = require("../config")
const jskos = require("jskos-tools")
const validate = require("jskos-validate")

const Mapping = require("../models/mappings")
const Annotation = require("../models/annotations")
const { MalformedBodyError, MalformedRequestError, EntityNotFoundError, InvalidBodyError, DatabaseAccessError, BackendError } = require("../errors")
const { bulkOperationForEntities } = require("../utils")
const { cdk } = require("cocoda-sdk")

const validateMapping = (mapping) => {
  const valid = validate.mapping(mapping)
  if (!valid) {
    return false
  }
  // Reject mappings without concepts in `from`
  if (jskos.conceptsOfMapping(mapping, "from").length === 0) {
    return false
  }
  return true
}

class MappingService {

  constructor() {
    this.schemeService = require("../services/schemes")
    this.concordanceService = require("../services/concordances")

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

  async getMappings({ uri, identifier, from, to, fromScheme, toScheme, mode, direction, type, partOf, creator, sort, order, limit, offset, download, annotatedWith, annotatedFor, annotatedBy, cardinality }) {
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
        return { $regex: `^${_.escapeRegExp(value.substring(0, value.length - 1))}` }
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
      if (partOf === "any") {
        // Mapping is part of any concordance
        mongoQuery4 = { "partOf.0": { $exists: true } }
      } else if (partOf === "none") {
        // Mapping is part of no concordance
        mongoQuery4 = { "partOf.0": { $exists: false } }
      } else {
        let uris = partOf.split("|")
        let allUris = []
        for (const uri of uris) {
          // Get concordance from database, then add all its identifiers
          try {
            const concordance = await this.concordanceService.get(uri)
            allUris = allUris.concat(concordance.uri, concordance.identifier || [])
          } catch (error) {
            // Ignore error and push URI only
            allUris.push(uri)
          }
        }
        mongoQuery4 = {
          $or: allUris.map(uri => ({ "partOf.uri": uri })),
        }
      }
    }

    // Concordances
    let mongoQuery5 = {}
    if (creator) {
      let creators = creator.split("|")
      mongoQuery5 = {
        $or: _.flatten(creators.map(creator => [
          jskos.isValidUri(creator) ? null : { "creator.prefLabel.de": new RegExp(_.escapeRegExp(creator), "i") },
          jskos.isValidUri(creator) ? null : { "creator.prefLabel.en": new RegExp(_.escapeRegExp(creator), "i") },
          jskos.isValidUri(creator) ? { "creator.uri": creator } : null,
        ].filter(Boolean))),
      }
    }

    // Cardinality
    let mongoQuery6 = {}
    if (cardinality === "1-to-1") {
      mongoQuery6 = { "to.memberSet.1": { $exists: false } }
    }

    const query = { $and: [mongoQuery1, mongoQuery2, mongoQuery3, mongoQuery4, mongoQuery5, mongoQuery6] }

    // Sorting (default: modified descending)
    sort = ["created", "modified", "mappingRelevance"].includes(sort) ? sort : "modified"
    order = order == "asc" ? 1 : -1
    // Currently default sort by modified descending
    const sorting = { [sort]: order }

    // Annotation assertions need special handling (see #176)
    const isNegativeAnnotationAssertion = (annotatedFor) => annotatedFor === "none" || (annotatedFor || "").startsWith("!")

    // Handle restrictions on sum of assessment annotations in `annotatedWith`
    let assessmentSumQuery, assessmentSumMatch
    if (annotatedWith && (!annotatedFor || annotatedFor === "assessing") && (assessmentSumMatch = annotatedWith.match(/^([<>]?)(=?)(-?\d+)$/)) && (assessmentSumMatch[1] || assessmentSumMatch[2])) {

      // Parameter `from` or `to` is required to use sum of assessment annotations
      if (!from && !to) {
        // Do nothing here; annotatedWith parameter will be completely ignored
      }
      // > or <
      else if (assessmentSumMatch[1]) {
        assessmentSumQuery = {
          _assessmentSum: { [`$${{ "<": "lt", ">": "gt"}[assessmentSumMatch[1]]}${{ "=": "e", "": "" }[assessmentSumMatch[2]]}`]: parseInt(assessmentSumMatch[3]) },
        }
      } else {
        assessmentSumQuery = {
          _assessmentSum: parseInt(assessmentSumMatch[3]),
        }
      }

      annotatedWith = null
    }

    const buildAnnotationQuery = ({ annotatedWith, annotatedFor, annotatedBy, prefix = "" }) => {
      const annotationQuery = {}
      if (annotatedWith) {
        annotationQuery[prefix + "bodyValue"] = annotatedWith
      }
      if (annotatedFor) {
        let annotatedForQuery = annotatedFor
        if (annotatedFor === "none") {
          annotatedForQuery = { $exists: false }
        } else if (annotatedFor === "any") {
          annotatedForQuery = { $exists: true }
        } else if (annotatedFor.startsWith("!")) {
          annotatedForQuery = { $ne: annotatedFor.slice(1) }
        }
        annotationQuery[prefix + "motivation"] = annotatedForQuery
      }
      if (annotatedBy) {
        annotationQuery[prefix + "creator.id"] = { $in: annotatedBy.split("|") }
      }
      return annotationQuery
    }

    const buildPipeline = ({ query, sorting, annotatedWith, annotatedBy, annotatedFor }) => {
      let pipeline = []
      const negativeAnnotationAssertion = isNegativeAnnotationAssertion(annotatedFor)

      // Filter by annotations
      // Three different paths
      // 1. No filter by annotations
      if (!annotatedWith && !annotatedBy && !annotatedFor && !assessmentSumQuery) {
        // Simply match mapping query
        pipeline.push({ $match: query })
        pipeline.push({ $sort: sorting })
        pipeline.model = Mapping
      }
      // 2. Filter by annotation, and from/to/creator is defined
      else if (from || to || creator || negativeAnnotationAssertion) {
        // We'll first filter the mappings, then add annotations and filter by those
        const annotationQuery = buildAnnotationQuery({ annotatedWith, annotatedFor, annotatedBy, prefix: "annotations." })
        pipeline = [
          { $match: query },
          { $sort: sorting },
          {
            $lookup: {
              from: "annotations",
              localField: "uri",
              foreignField: "target.id",
              as: "annotations",
            },
          },
          {
            $match: annotationQuery,
          },
          // Deal with assessmentSumQuery here
          ...(assessmentSumQuery ? [
            // 1. Calculate assessment sum
            {
              $set: {
                _assessmentSum: {
                  $function: {
                    lang: "js",
                    args: ["$annotations"],
                    body: function (annotations) {
                      return annotations.reduce((prev, cur) => {
                        if (cur.motivation === "assessing") {
                          if (cur.bodyValue === "+1") return prev + 1
                          if (cur.bodyValue === "-1") return prev - 1
                        }
                        return prev
                      }, 0)
                    },
                  },
                },
              },
            },
            // 2. Add query
            { $match: assessmentSumQuery },
          ] : []),
          { $project: { annotations: 0, _assessmentSum: 0 } },
        ]
        pipeline.model = Mapping
      }
      // 3. Filter by annotation, and none of the properties is given
      else {
        // We'll first filter the annotations, then get the associated mappings, remove duplicates, and filter those
        const annotationQuery = buildAnnotationQuery({ annotatedWith, annotatedFor, annotatedBy })
        pipeline = [
          // First, match annotations
          {
            $match: annotationQuery,
          },
          // Get mappings for annotations
          {
            $lookup: {
              from: "mappings",
              localField: "target.id",
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
          // Sort
          { $sort: sorting },
          // Match mappings
          { $match: query },
        ]
        pipeline.model = Annotation
      }
      return pipeline
    }

    const pipeline = buildPipeline({ query, sorting, annotatedWith, annotatedBy, annotatedFor })
    const negativeAnnotationAssertion = isNegativeAnnotationAssertion(annotatedFor)

    if (download) {
      // For a download, return a stream
      return pipeline.model.aggregate(pipeline).cursor()
    } else {
      // Otherwise, return results
      const mappings = await pipeline.model.aggregate(pipeline).skip(offset).limit(limit).exec()
      // Handle negative annotation assertions differently because counting is inefficient
      if (negativeAnnotationAssertion) {
        // Instead, count by building a pipeline without `annotatedFor`, then another pipeline with the opposite `annotatedFor`, count for both and calculate the difference
        const totalCountPipeline = buildPipeline({ query, sorting, annotatedWith, annotatedBy })
        const oppositeCountPipeline = buildPipeline({ query, sorting, annotatedWith, annotatedBy, annotatedFor: annotatedFor === "none" ? "any" : annotatedFor.slice(1) })
        mappings.totalCount = await utils.count(totalCountPipeline.model, totalCountPipeline) - await utils.count(oppositeCountPipeline.model, oppositeCountPipeline)
      } else {
        mappings.totalCount = await utils.count(pipeline.model, pipeline)
      }
      return mappings
    }
  }

  async get(_id) {
    return this.getMapping(_id)
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
   * Infer mappings based on the source concept's ancestors. (see https://github.com/gbv/jskos-server/issues/177)
   */
  async inferMappings({ strict, depth, ...query }) {
    if (query.to) {
      // `to` parameter not supported
      throw new MalformedRequestError("Query parameter \"to\" is not supported in /mappings/infer.")
    }

    // Remove unsupported query parameters
    delete query.cardinality
    query.cardinality = "1-to-1"
    delete query.download

    if (query.direction && query.direction !== "forward") {
      throw new MalformedRequestError("Only direction \"forward\" is supported in /mappings/infer.")
    }
    let { from, fromScheme, type } = query

    // Do not continue with empty `from` parameter
    if (!from || !fromScheme) {
      return []
    }

    // Try getMappings first; return if there are results
    let mappings = await this.getMappings(query)
    if (mappings.length) {
      return mappings
    }

    strict = ["true", "1"].includes(strict) ? true : false
    depth = parseInt(depth)
    depth = (isNaN(depth) || depth < 0) ? null : depth

    if (depth === 0) {
      return []
    }

    fromScheme = await this.schemeService.getScheme(fromScheme)
    try {
      const registry = fromScheme && cdk.registryForScheme(fromScheme)
      registry && await registry.init()
      // If fromScheme is not found or has no JSKOS API, return empty result
      if (!fromScheme || !registry || !registry.has.ancestors) {
        return []
      }
      fromScheme = new jskos.ConceptScheme(fromScheme)

      // Build URI from notation if necessary
      if (!jskos.isValidUri(from)) {
        from = fromScheme.uriFromNotation(from)
        if (!from) {
          return []
        }
      }

      // Build new type set
      type = (type || "").split("|").filter(Boolean)
      const types = []
      if (type.includes("http://www.w3.org/2004/02/skos/core#mappingRelation") || type.length === 0) {
        types.push("http://www.w3.org/2004/02/skos/core#mappingRelation")
      }
      if (type.includes("http://www.w3.org/2004/02/skos/core#narrowMatch") || type.length === 0) {
        types.push("http://www.w3.org/2004/02/skos/core#exactMatch")
        types.push("http://www.w3.org/2004/02/skos/core#narrowMatch")
        if (!strict) {
          types.push("http://www.w3.org/2004/02/skos/core#closeMatch")
        }
      }
      if (type.includes("http://www.w3.org/2004/02/skos/core#relatedMatch") || type.length === 0) {
        types.push("http://www.w3.org/2004/02/skos/core#relatedMatch")
      }

      // If there are no types in new type set, return empty result
      if (types.length === 0) {
        return []
      }

      // Retrieve ancestors from API
      let ancestors = await registry.getAncestors({ concept: { uri: from } })
      if (depth !== null) {
        ancestors = ancestors.slice(0, depth)
      }
      for (const uri of ancestors.map(a => a && a.uri).filter(Boolean)) {
        mappings = await this.getMappings(Object.assign({}, query, { from: uri, type: types.join("|") }))
        if (mappings.length) {
          return mappings.map(m => {
            const mapping = {
              from: {},
              fromScheme: m.fromScheme,
              to: m.to,
              toScheme: m.toScheme,
            }
            if (m.uri) {
              mapping.source = [{ uri: m.uri }]
            }
            const fromConcept = {
              uri: from,
            }
            const notation = fromScheme.notationFromUri(from)
            if (notation) {
              fromConcept.notation = [notation]
            }
            mapping.from.memberSet = [fromConcept]
            const type = _.get(m, "type[0]") || "http://www.w3.org/2004/02/skos/core#mappingRelation"
            if (type === "http://www.w3.org/2004/02/skos/core#exactMatch" || !strict && type === "http://www.w3.org/2004/02/skos/core#closeMatch") {
              mapping.type = ["http://www.w3.org/2004/02/skos/core#narrowMatch"]
            } else {
              mapping.type = [type]
            }
            return jskos.addMappingIdentifiers(mapping)
          })
        }
      }
    } catch (error) {
      // This mainly catches errors related to the API requests for ancestors and mappings
      throw new BackendError(`There was an error retrieving ancestors for concept ${from}: ${error.message}`)
    }

    return []

  }

  /**
   * Save a single mapping or multiple mappings in the database. Adds created date, validates the mapping, and adds identifiers.
   */
  async postMapping({ bodyStream, bulk = false, bulkReplace = true }) {
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

    // Adjust all mappings
    mappings = await Promise.all(mappings.map(async mapping => {
      try {
        // Add created and modified dates.
        const now = (new Date()).toISOString()
        if (!bulk || !mapping.created) {
          mapping.created = now
        }
        mapping.modified = now
        // Validate mapping
        if (!validateMapping(mapping)) {
          throw new InvalidBodyError()
        }
        if (mapping.partOf) {
          throw new InvalidBodyError("Property `partOf` is currently not allowed.")
        }
        // Check cardinality for 1-to-1
        if (config.mappings.cardinality == "1-to-1" && jskos.conceptsOfMapping(mapping, "to").length > 1) {
          throw new InvalidBodyError("Only 1-to-1 mappings are supported.")
        }
        // Check if schemes are available and replace them with URI/notation only
        // TODO: Should we only support mappings for known schemes?
        await this.schemeService.replaceSchemeProperties(mapping, ["fromScheme", "toScheme"])
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
    }))
    mappings = mappings.filter(m => m)

    if (bulk) {
      // Use bulkWrite for most efficiency
      mappings.length && await Mapping.bulkWrite(bulkOperationForEntities({ entities: mappings, replace: bulkReplace }))
      response = mappings.map(c => ({ uri: c.uri }))
    } else {
      response = await Mapping.insertMany(mappings, { lean: true })
    }

    return isMultiple ? response : response[0]
  }

  async putMapping({ body, existing }) {
    let mapping = body
    if (!mapping) {
      throw new InvalidBodyError()
    }
    // Add modified date.
    mapping.modified = (new Date()).toISOString()
    // Validate mapping
    if (!validateMapping(mapping)) {
      throw new InvalidBodyError()
    }
    if (config.mappings.cardinality == "1-to-1" && jskos.conceptsOfMapping(mapping, "to").length > 1) {
      throw new InvalidBodyError("Only 1-to-1 mappings are supported.")
    }
    // If it's part of a concordance, don't allow changing fromScheme/toScheme
    if (existing.partOf && existing.partOf.length) {
      if (!jskos.compare(existing.fromScheme, mapping.fromScheme) || !jskos.compare(existing.toScheme, mapping.toScheme)) {
        throw new InvalidBodyError("Can't change fromScheme/toScheme on a mapping that belongs to a concordance.")
      }
    }
    this.checkWhitelists(mapping)

    // Override _id, uri, and created properties
    mapping._id = existing._id
    mapping.uri = existing.uri
    mapping.created = existing.created
    // Set mapping identifier
    mapping.identifier = jskos.addMappingIdentifiers(mapping).identifier

    const result = await Mapping.replaceOne({ _id: existing._id }, mapping)
    if (result.acknowledged && result.matchedCount) {
      // Update concordances if necessary
      if (existing.partOf && existing.partOf[0]) {
        await this.concordanceService.postAdjustmentForConcordance(existing.partOf[0].uri)
      }
      if (body.partOf && body.partOf[0]) {
        await this.concordanceService.postAdjustmentForConcordance(body.partOf[0].uri)
      }
      return mapping
    } else {
      throw new DatabaseAccessError()
    }
  }

  async patchMapping({ body, existing }) {
    let mapping = body
    if (!mapping) {
      throw new InvalidBodyError()
    }

    _.unset(mapping, "_id")
    _.unset(mapping, "uri")
    _.unset(mapping, "created")
    // Remove creator/contributor if there are no changes
    // TODO: Possibly check this is utils.handleCreatorForObject
    if (body.creator && _.isEqual(body.creator, existing.creator)) {
      _.unset(mapping, "creator")
    }
    if (body.contributor && _.isEqual(body.contributor, existing.contributor)) {
      _.unset(mapping, "contributor")
    }
    // Add modified date, except if only updating `partOf`
    const keys = Object.keys(body)
    if (keys.length === 1 && keys[0] === "partOf") {
      _.unset(mapping, "modified")
    } else {
      mapping.modified = (new Date()).toISOString()
    }
    // If it's part of a concordance, don't allow changing fromScheme/toScheme
    if (existing.partOf && existing.partOf.length) {
      if (mapping.fromScheme && !jskos.compare(existing.fromScheme, mapping.fromScheme) || mapping.toScheme && !jskos.compare(existing.toScheme, mapping.toScheme)) {
        throw new InvalidBodyError("Can't change fromScheme/toScheme on a mapping that belongs to a concordance.")
      }
    }
    // Merge mappings
    const newMapping = Object.assign({}, existing, mapping)
    // Set mapping identifier
    newMapping.identifier = jskos.addMappingIdentifiers(newMapping).identifier

    // Validate mapping after merge
    if (!validateMapping(newMapping)) {
      throw new InvalidBodyError()
    }
    if (config.mappings.cardinality == "1-to-1" && jskos.conceptsOfMapping(mapping, "to").length > 1) {
      throw new InvalidBodyError("Only 1-to-1 mappings are supported.")
    }
    this.checkWhitelists(mapping)

    const result = await Mapping.replaceOne({ _id: newMapping._id }, newMapping)
    if (result.acknowledged) {
      // Update concordances if necessary
      if (existing.partOf && existing.partOf[0]) {
        await this.concordanceService.postAdjustmentForConcordance(existing.partOf[0].uri)
      }
      if (body.partOf && body.partOf[0]) {
        await this.concordanceService.postAdjustmentForConcordance(body.partOf[0].uri)
      }
      return newMapping
    } else {
      throw new DatabaseAccessError()
    }
  }

  async deleteMapping({ existing }) {
    const result = await Mapping.deleteOne({ _id: existing._id })
    if (!result.deletedCount) {
      throw new DatabaseAccessError()
    }
    // Update concordance if necessary
    if (existing.partOf && existing.partOf[0]) {
      await this.concordanceService.postAdjustmentForConcordance(existing.partOf[0].uri)
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
            count: { $sum: 1 },
          },
        },
      ]).exec(),
      Mapping.aggregate([
        match,
        {
          $group: {
            _id: "$toScheme",
            count: { $sum: 1 },
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
      or.push({ [path + ".notation"]: { $regex: `^${_.escapeRegExp(search)}` } })
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
    indexes.push([{
      "fromScheme.uri": 1,
      modified: -1,
    }, {}])
    indexes.push([{
      "fromScheme.notation": 1,
      modified: -1,
    }, {}])
    indexes.push([{
      "toScheme.uri": 1,
      modified: -1,
    }, {}])
    indexes.push([{
      "toScheme.notation": 1,
      modified: -1,
    }, {}])
    indexes.push([{
      "partOf.uri": 1,
      modified: -1,
    }, {}])
    indexes.push([{ uri: 1 }, {}])
    indexes.push([{ identifier: 1 }, {}])
    indexes.push([{ type: 1 }, {}])
    indexes.push([{ created: 1 }, {}])
    indexes.push([{ modified: 1 }, {}])
    indexes.push([{ mappingRelevance: 1 }, {}])
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

module.exports = new MappingService()
