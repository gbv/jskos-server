import config from "../config/index.js"
import _ from "lodash"
import jskos from "jskos-tools"
import { DuplicateEntityError, EntityNotFoundError, CreatorDoesNotMatchError, DatabaseInconsistencyError, InvalidBodyError } from "../errors/index.js"

import { v4 as uuid } from "uuid"

import { Transform, Readable } from "node:stream"
import JSONStream from "JSONStream"
import * as anystream from "json-anystream"
import express from "express"
import * as searchHelper from "./searchHelper.js"

// Services, keys are according to req.type
const services = {}
import("../services/index.js").then(allServices => {
  for (let type of Object.keys(allServices.byType)) {
    Object.defineProperty(services, `${type}s`, {
      get() {
        return allServices[`${type}Service`]
      },
    })
  }
})

/**
 * These are wrappers for Express middleware which receive a middleware function as a first parameter,
 * but wrap the call to the function with other functionality.
 */
const wrappers = {

  /**
   * Wraps an async middleware function that returns data in the Promise.
   * The result of the Promise will be written into req.data for access by following middlewaren.
   * A rejected Promise will be caught and relayed to the Express error handling.
   *
   * adjusted from: https://thecodebarbarian.com/80-20-guide-to-express-error-handling
   */
  async(fn) {
    return (req, res, next) => {
      fn(req, res, next).then(data => {
        // On success, save the result of the Promise in req.data.
        req.data = data
        next()
      }).catch(error => {
        // Catch and change certain errors
        if (error.code === 11000) {
          const _id = _.get(error, "keyValue._id") || _.get(error, "writeErrors[0].err.op._id")
          error = new DuplicateEntityError(null, `${_id} (${req.type})`)
        }
        // Pass error to the next error middleware.
        next(error)
      })
    }
  },

  // Middleware wrapper that calls the middleware depending on req.query.download
  download(fn, isDownload = true) {
    return (req, res, next) => {
      if (!!req.query.download === isDownload) {
        fn(req, res, next)
      } else {
        next()
      }
    }
  },

}

/**
 * Recursively remove certain fields from response
 *
 * Gets called in `returnJSON` and `handleDownload`. Shouldn't be used anywhere else.
 *
 * @param {(Object|Object[])} json JSON object or array of objects
 * @param {number} [depth=0] Should not be set when called from outside
 */
const cleanJSON = (json, depth = 0) => {
  if (_.isArray(json)) {
    json.forEach(value => cleanJSON(value, depth))
  } else if (_.isObject(json)) {
    _.forOwn(json, (value, key) => {
      if (
        // Remove top level empty arrays/objects if closedWorldAssumption is set to false
        (depth === 0 && !config.closedWorldAssumption && (_.isEqual(value, {}) || _.isEqual(value, [])) )
        // Remove all fields started with _
        || key.startsWith("_")
      ) {
        _.unset(json, key)
      } else {
        cleanJSON(value, depth + 1)
      }
    })
  }
}


// remove object properties when its value is null
const removeNullProperties = obj => Object.keys(obj).filter(key => obj[key] === null).forEach(key => delete obj[key])

// Adjust data in req.data based on req.type (which is set by `addMiddlewareProperties`)
const adjust = async (req, res, next) => {
  /**
   * Skip adjustments if either:
   * - there is no data
   * - there is no data type (i.e. we don't know which adjustment method to use)
   * - the request was a bulk operation
   */
  if (!req.data || !req.type || req.query.bulk) {
    next()
  }
  req.data = await adjust.data({ req })
  next()
}

// Wrapper around adjustments; `req` only has required property path `query.properties` if `data` and `type` are given.
adjust.data = async ({ req, data, type }) => {
  data = data ?? req.data
  type = type ?? req.type
  // If data is still a mongoose object, convert it to plain object
  if (_.isArray(data) && data[0]?.toObject) {
    data = data.map(item => item.toObject ? item.toObject() : item)
  } else if (!_.isArray(data) && data.toObject) {
    data = data.toObject()
  }
  // Remove "s" from the end of type if it's not an array
  if (!_.isArray(data)) {
    type = type.substring(0, type.length - 1)
  }
  if (adjust[type]) {
    let addProperties = [], removeProperties = [], mode = 0 // mode 0 = add, mode 1 = remove
    for (let prop of _.get(req, "query.properties", "").split(",")) {
      if (prop.startsWith("*")) {
        addProperties.push("narrower")
        addProperties.push("ancestors")
        addProperties.push("annotations")
        continue
      }
      if (prop.startsWith("-")) {
        mode = 1
        prop = prop.slice(1)
      } else if (prop.startsWith("+")) {
        mode = 0
        prop = prop.slice(1)
      }
      if (mode === 1) {
        removeProperties.push(prop)
      } else {
        addProperties.push(prop)
        // If a property is explicitly added after it was removed, it should not be removed anymore
        removeProperties = removeProperties.filter(p => p !== prop)
      }
    }
    addProperties = addProperties.filter(Boolean)
    removeProperties = removeProperties.filter(Boolean)
    // Adjust data with properties
    data = await adjust[type](data, addProperties)
    // Remove properties if necessary
    const dataToAdjust = Array.isArray(data) ? data : [data]
    removeProperties.forEach(property => {
      dataToAdjust.filter(Boolean).forEach(entity => {
        delete entity[property]
      })
    })
  }
  return data
}

// Add @context and type to annotations.
adjust.annotation = (annotation) => {
  if (annotation) {
    annotation["@context"] = "http://www.w3.org/ns/anno.jsonld"
    annotation.type = "Annotation"
  }
  return annotation
}
adjust.annotations = annotations => {
  return annotations.map(annotation => adjust.annotation(annotation))
}

// Add @context and type to concepts. Also load properties narrower, ancestors, and annotations if necessary.
adjust.concept = async (concept, properties = []) => {
  if (concept) {
    concept["@context"] = "https://gbv.github.io/jskos/context.json"
    concept.type = concept.type || ["http://www.w3.org/2004/02/skos/core#Concept"]
    // Add properties (narrower, ancestors)
    for (let property of ["narrower", "ancestors"].filter(p => properties.includes(p))) {
      concept[property] = await Promise.all((await services.concepts[`get${property.charAt(0).toUpperCase() + property.slice(1)}`]({ uri: concept.uri })).map(concept => adjust.concept(concept)))
    }
    // Add properties (annotations)
    if (config.annotations && properties.includes("annotations") && concept.uri) {
      concept.annotations = (await services.annotations.getAnnotations({ target: concept.uri })).map(annotation => adjust.annotation(annotation))
    }
  }
  return concept
}
adjust.concepts = async (concepts, properties) => {
  return await Promise.all(concepts.map(concept => adjust.concept(concept, properties)))
}

// Add @context to concordances.
adjust.concordance = (concordance) => {
  if (concordance) {
    concordance["@context"] = "https://gbv.github.io/jskos/context.json"
    // Remove existing "distributions" array (except for external URLs)
    concordance.distributions = (concordance.distributions || []).filter(dist => !dist.download || !dist.download.startsWith(config.baseUrl))
    // Add distributions for JSKOS and CSV
    concordance.distributions = [
      {
        download: `${config.baseUrl}mappings?partOf=${encodeURIComponent(concordance.uri)}&download=ndjson`,
        format: "http://format.gbv.de/jskos",
        mimetype: "application/x-ndjson; charset=utf-8",
      },
      {
        download: `${config.baseUrl}mappings?partOf=${encodeURIComponent(concordance.uri)}&download=csv`,
        mimetype: "text/csv; charset=utf-8",
      },
    ].concat(concordance.distributions)
  }
  return concordance
}
adjust.concordances = (concordances) => {
  return concordances.map(concordance => adjust.concordance(concordance))
}

// Add @context to mappings. Also load annotations if necessary.
adjust.mapping = async (mapping, properties = []) => {
  if (mapping) {
    mapping["@context"] = "https://gbv.github.io/jskos/context.json"
    // Add properties (annotations)
    if (config.annotations && properties.includes("annotations") && mapping.uri) {
      mapping.annotations = (await services.annotations.getAnnotations({ target: mapping.uri })).map(annotation => adjust.annotation(annotation))
    }
  }
  return mapping
}
adjust.mappings = async (mappings, properties) => {
  return await Promise.all(mappings.map(mapping => adjust.mapping(mapping, properties)))
}

// Add @context and type to schemes.
adjust.scheme = (scheme) => {
  if (scheme) {
    scheme["@context"] = "https://gbv.github.io/jskos/context.json"
    scheme.type = scheme.type || ["http://www.w3.org/2004/02/skos/core#ConceptScheme"]
    // Remove existing "distributions" array (except for external URLs)
    scheme.distributions = (scheme.distributions || []).filter(dist => !dist.download || !dist.download.startsWith(config.baseUrl))
    if (scheme.concepts && scheme.concepts.length) {
      // If this instance contains concepts for this scheme, add distribution for it
      scheme.distributions = [
        {
          download: `${config.baseUrl}voc/concepts?uri=${encodeURIComponent(scheme.uri)}&download=ndjson`,
          format: "http://format.gbv.de/jskos",
          mimetype: "application/x-ndjson; charset=utf-8",
        },
        {
          download: `${config.baseUrl}voc/concepts?uri=${encodeURIComponent(scheme.uri)}&download=json`,
          mimetype: "application/json; charset=utf-8",
        },
      ].concat(scheme.distributions)
      // Also add `API` field if it does not exist
      if (!scheme.API) {
        scheme.API = [
          {
            type: "http://bartoc.org/api-type/jskos",
            url: config.baseUrl,
          },
        ]
      }
    }
    // Add distributions based on API field
    (scheme.API || []).filter(api => api.type === "http://bartoc.org/api-type/jskos" && api.url !== config.baseUrl).forEach(api => {
      scheme.distributions.push({
        download: `${api.url}voc/concepts?uri=${encodeURIComponent(scheme.uri)}&download=ndjson`,
        format: "http://format.gbv.de/jskos",
        mimetype: "application/x-ndjson; charset=utf-8",
      })
      scheme.distributions.push({
        download: `${api.url}voc/concepts?uri=${encodeURIComponent(scheme.uri)}&download=json`,
        mimetype: "application/json; charset=utf-8",
      })
    })
    if (!scheme.distributions.length) {
      delete scheme.distributions
    }
  }
  return scheme
}
adjust.schemes = (schemes) => {
  return schemes.map(scheme => adjust.scheme(scheme))
}

/**
 * Returns a random v4 UUID.
 */

const uuidRegex = new RegExp(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i)
/**
 * Checks a v4 UUID for validity.
 *
 * @param {*} uuid
 */
const isValidUuid = (uuid) => {
  return uuid.match(uuidRegex) != null
}

const getUrisForUser = (user) => {
  if (!user) {
    return []
  }
  return [user.uri].concat(Object.values(user.identities || {}).map(identity => identity.uri)).filter(uri => uri != null)
}

const buildUrlForLinkHeader = ({ query, rel, req }) => {
  let url = config.baseUrl.substring(0, config.baseUrl.length - 1) + req.path
  if (!query && req) {
    query = req.query
  }
  let index = 0
  _.forOwn(_.omit(query, ["bulk"]), (value, key) => {
    url += `${(index == 0 ? "?" : "&")}${key}=${encodeURIComponent(value)}`
    index += 1
  })
  return `<${url}>; rel="${rel}"`
}

/**
 * Returns `true` if the creator of `object` matches `user`, `false` if not.
 * `object.creator` can be
 * - an array of objects
 * - an object
 * - a string
 * The object for a creator will be checked for properties `uri` (e.g. JSKOS mapping) and `id` (e.g. annotations).
 *
 * If config.auth.allowCrossUserEditing is enabled, this returns true as long as a user and object are given.
 *
 * @param {object} options.req the request object (that includes req.user, req.crossUser, and req.auth)
 * @param {object} options.object any object that has the property `creator`
 * @param {boolean} options.withContributors allow contributors to be matched (for object with superordinated object)
 */
const matchesCreator = ({ req = {}, object, withContributors = false }) => {
  const { user, crossUser, auth } = req
  if (!auth) {
    return true
  }
  if (!object || !user) {
    return false
  }
  const userUris = getUrisForUser(user)
  if (crossUser === true || _.intersection(crossUser || [], userUris).length) {
    return true
  }
  // Support arrays, objects, and strings as creators
  let creators = _.isArray(object.creator) ? object.creator : (_.isObject(object.creator) ? [object.creator] : [{ uri: object.creator }])
  // Also check contributors if requested
  let contributors = withContributors ? (object.contributor || []) : []
  for (let creator of creators.concat(contributors)) {
    if (userUris.includes(creator.uri) || userUris.includes(creator.id)) {
      return true
    }
  }
  return false
}

/**
 * Middleware that adds default headers.
 */
const addDefaultHeaders = (req, res, next) => {
  if (req.headers.origin) {
    // Allow all origins by returning the request origin in the header
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin)
  } else {
    // Fallback to * if there is no origin in header
    res.setHeader("Access-Control-Allow-Origin", "*")
  }
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,PATCH,DELETE")
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Link")
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  // Deprecation headers for /narrower, /ancestors, /search, and /suggest
  // TODO for 3.0: Remove these headers
  if (["/narrower", "/ancestors", "/search", "/suggest"].includes(req.path)) {
    res.setHeader("Deprecation", true)
    const links = []
    links.push(buildUrlForLinkHeader({ req, rel: "alternate" }))
    links[0] = links[0].replace(req.path, `/concepts${req.path}`)
    links.push("<https://github.com/gbv/jskos-server/releases/tag/v2.0.0>; rel=\"deprecation\"")
    res.set("Link", links.join(","))
  }
  next()
}

/**
 * Middleware that adds default properties:
 *
 * - If req.query exists, make sure req.query.limit and req.query.offset are set as numbers.
 * - If possible, set req.type depending on the endpoint (one of concepts, schemes, mappings, annotations, suggest).
 */
const addMiddlewareProperties = (req, res, next) => {
  if (req.query) {
    // Limit for pagination
    const defaultLimit = 100
    req.query.limit = parseInt(req.query.limit)
    if (isNaN(req.query.limit) || req.query.limit <= 0) {
      req.query.limit = defaultLimit
    }
    // Offset for pagination
    const defaultOffset = 0
    req.query.offset = parseInt(req.query.offset)
    if (isNaN(req.query.offset) || req.query.offset < 0) {
      req.query.offset = defaultOffset
    }
    // Bulk option for POST endpoints
    req.query.bulk = req.query.bulk === "true" || req.query.bulk === "1"
  }
  // req.path -> req.type
  let type = req.path.substring(1)
  type = type.substring(0, type.indexOf("/") == -1 ? type.length : type.indexOf("/") )
  if (type == "voc") {
    if (req.path.includes("/top") || (req.path.includes("/concepts") && req.method !== "DELETE" )) {
      type = "concepts"
    } else {
      type = "schemes"
    }
  }
  if (type == "mappings") {
    if (req.path.includes("/suggest")) {
      type = "suggest"
    } else if (req.path.includes("/voc")) {
      type = "schemes"
    }
  }
  if (["concepts", "narrower", "ancestors", "search"].includes(type)) {
    if (req.path.includes("/suggest")) {
      type = "suggest"
    } else {
      type = "concepts"
    }
  }
  if (type == "suggest" && _.get(req, "query.format", "").toLowerCase() == "jskos") {
    type = "concepts"
  }
  req.type = type

  // Add req.action
  const action = {
    GET: "read",
    POST: "create",
    PUT: "update",
    PATCH: "update",
    DELETE: "delete",
  }[req.method]
  req.action = action
  // Add req.anonymous, req.crossUser, and req.auth if necessary
  if (config[type] && config[type].anonymous) {
    req.anonymous = true
  }
  if (["PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (config[type] && config[type][action] && config[type][action].crossUser) {
      req.crossUser = config[type][action].crossUser
    }
  }
  if (config[type] && config[type][action] && config[type][action].auth) {
    req.auth = true
  }
  next()
}

/**
 * Middleware that receives a list of supported download formats and overrides req.query.download if the requested format is not supported.
 *
 * @param {Array} formats
 */
const supportDownloadFormats = (formats) => (req, res, next) => {
  if (req.query.download && !formats.includes(req.query.download)) {
    req.query.download = null
  }
  next()
}

/**
 * Sets pagination headers (X-Total-Count, Link) for a response.
 * See also: https://developer.github.com/v3/#pagination
 * For Link header rels:
 * - first and last are always set
 * - prev will be set if previous page exists (i.e. if offset > 0)
 * - next will be set if next page exists (i.e. if offset + limit < total)
 *
 * Requires req.data to be set.
 */
const addPaginationHeaders = (req, res, next) => {
  const limit = req.query.limit
  const offset = req.query.offset
  const total = _.get(req, "data.totalCount", req.data && req.data.length)
  if (req == null || res == null || limit == null || offset == null) {
    next()
    return
  }
  // Set X-Total-Count header
  if (total === null) {
    // ! This is a workaround! We don't know the total number, so we just return an unreasonably high number here. See #176.
    res.set("X-Total-Count", 9999999)
  } else {
    res.set("X-Total-Count", total)
  }
  let links = []
  let query = _.cloneDeep(req.query)
  query.limit = limit
  // rel: first
  query.offset = 0
  links.push(buildUrlForLinkHeader({ req, query, rel: "first" }))
  // rel: prev
  if (offset > 0) {
    query.offset = Math.max(offset - limit, 0)
    links.push(buildUrlForLinkHeader({ req, query, rel: "prev" }))
  }
  // rel: next
  if (total && limit + offset < total || req.data && req.data.length === limit) {
    query.offset = offset + limit
    links.push(buildUrlForLinkHeader({ req, query, rel: "next" }))
  }
  // rel: last
  if (total !== null) {
    let current = 0
    while (current + limit < total) {
      current += limit
    }
    query.offset = current
    links.push(buildUrlForLinkHeader({ req, query, rel: "last" }))
  } else if (req.data.length < limit) {
    // Current page is last
    links.push(buildUrlForLinkHeader({ req, query, rel: "last" }))
  }
  // Push existing Link header to the back
  links.push(res.get("Link"))
  // Set Link header
  res.set("Link", links.join(","))
  next()
}

/**
 * Middleware that returns JSON given in req.data.
 */
const returnJSON = (req, res) => {
  // Convert Mongoose documents into plain objects
  let data
  if (_.isArray(req.data)) {
    data = req.data.map(doc => doc.toObject ? doc.toObject() : doc)
    // Preserve totalCount
    data.totalCount = req.data.totalCount
  } else {
    data = req.data.toObject ? req.data.toObject() : req.data
  }
  cleanJSON(data)
  let statusCode = 200
  if (req.method == "POST") {
    statusCode = 201
  }
  res.status(statusCode).json(data)
}
/**
 * Middleware that handles download streaming.
 * Requires a database cursor in req.data.
 *
 * @param {String} filename - resulting filename without extension
 */
const handleDownload = (filename) => (req, res) => {
  let results = req.data, single = false
  // Convert to stream if necessary
  if (!(results instanceof Readable)) {
    if (!_.isArray(results)) {
      single = true
    }
    results = new Readable({ objectMode: true })
    results.push(req.data)
    results.push(null)
  }
  /**
   * Transformation object to remove _id parameter from objects in a stream.
   */
  const removeIdTransform = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      cleanJSON(chunk)
      this.push(chunk)
      callback()
    },
  })
  // Default transformation: JSON
  let transform = JSONStream.stringify(single ? "" : "[\n\t", ",\n\t", single ? "\n" : "\n]\n")
  let fileEnding = "json"
  let first = true, delimiter = ","
  let csv
  switch (req.query.download) {
    case "ndjson":
      fileEnding = "ndjson"
      res.set("Content-Type", "application/x-ndjson; charset=utf-8")
      transform = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          this.push(JSON.stringify(chunk) + "\n")
          callback()
        },
      })
      break
    case "csv":
    case "tsv":
      fileEnding = req.query.download
      if (req.query.download == "csv") {
        delimiter = ","
        res.set("Content-Type", "text/csv; charset=utf-8")
      } else {
        delimiter = "\t"
        res.set("Content-Type", "text/tab-separated-values; charset=utf-8")
      }
      csv = jskos.mappingCSV({
        lineTerminator: "\r\n",
        creator: true,
        schemes: true,
        delimiter,
      })
      transform = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
        // Small workaround to prepend a line to CSV
          if (first) {
            this.push(`"fromScheme"${delimiter}"fromNotation"${delimiter}"toScheme"${delimiter}"toNotation"${delimiter}"toNotation2"${delimiter}"toNotation3"${delimiter}"toNotation4"${delimiter}"toNotation5"${delimiter}"type"${delimiter}"creator"\n`)
            first = false
          }
          this.push(csv.fromMapping(chunk, { fromCount: 1, toCount: 5 }))
          callback()
        },
      })
      break
  }
  // Add file header
  res.set("Content-disposition", `attachment; filename=${filename}.${fileEnding}`)
  // results is a database cursor
  results
    .pipe(removeIdTransform)
    .pipe(transform)
    .pipe(res)
}

/**
 * Extracts a creator objects from a request.
 *
 * @param {*} req request object
 */
const getCreator = (req) => {
  let creator = {}
  const creatorUriPath = req.type === "annotations" ? "id" : "uri"
  const creatorNamePath = req.type === "annotations" ? "name" : "prefLabel.en"
  const userUris = getUrisForUser(req.user)
  if (req.user && !userUris.includes(req.query.identity)) {
    _.set(creator, creatorUriPath, req.user.uri)
  } else if (req.query.identity) {
    _.set(creator, creatorUriPath, req.query.identity)
  }
  if (req.query.identityName) {
    _.set(creator, creatorNamePath, req.query.identityName)
  } else if (req.query.identityName !== "") {
    const name = _.get(Object.values(_.get(req, "user.identities", [])).find(i => i.uri === _.get(creator, creatorUriPath)) || req.user, "name")
    if (name) {
      _.set(creator, creatorNamePath, name)
    }
  }
  if (!_.get(creator, creatorUriPath) && !_.get(creator, creatorNamePath)) {
    creator = null
  }
  return creator
}

/**
 * See https://github.com/gbv/jskos-server/issues/153#issuecomment-997847433
 *
 * @param {Object} options.object JSKOS object
 * @param {Object} [options.existing] existing object from database for PUT/PATCH
 * @param {Object} [options.creator] creator object, usually extracted via `getCreator` above
 * @param {Object} options.req request object (necessary for `type`, `user`, `method`, `anonymous`, and `auth`)
 */
const handleCreatorForObject = ({ object, existing, creator, req }) => {
  if (!object) {
    return object
  }

  if (req.type === "annotations") {
    // No "contributor" for annotations
    delete object.contributor
  } else if (creator) {
    // JSKOS creator has to be an array
    creator = [creator]
  }

  const userUris = getUrisForUser(req.user)
  const anonymous = req.anonymous
  const auth = req.auth

  if (req.method === "POST") {
    if (anonymous) {
      delete object.creator
      delete object.contributor
    } else if (auth) {
      if (creator) {
        object.creator = creator
      } else {
        delete object.creator
      }
    }
  } else if (req.method === "PUT" || req.method === "PATCH") {
    if (anonymous) {
      if (req.method === "PUT") {
        object.creator = existing && existing.creator
        object.contributor = existing && existing.contributor
      } else {
        delete object.creator
        delete object.contributor
      }
    } else if (auth) {
      if (existing && existing.creator) {
        // Don't allow overriding existing creator
        if (req.method === "PUT") {
          object.creator = existing.creator
        } else {
          delete object.creator
        }
      } else if (object.creator && creator) {
        // If creator is overridden, it can only be the user
        object.creator = creator
      }
      // Update creator and/or add to contributor
      if (creator) {
        if (req.type === "annotations") {
          // Only update creator if it's the user
          if (userUris.includes((object.creator || existing && existing.creator || {}).id)) {
            object.creator = creator
          }
        } else {
          const findUserPredicate = c => jskos.compare(c, { identifier: userUris })
          const objectCreatorIndex = (object.creator || []).findIndex(findUserPredicate)
          const existingCreatorIndex = (existing && existing.creator || []).findIndex(findUserPredicate)
          const objectContributorIndex = (object.contributor || []).findIndex(findUserPredicate)
          const existingContributorIndex = (existing && existing.contributor || []).findIndex(findUserPredicate)
          if (objectCreatorIndex !== -1) {
            object.creator[objectCreatorIndex] = creator[0]
          } else if (objectContributorIndex !== -1) {
            object.contributor.splice(objectContributorIndex, 1)
            object.contributor.push(creator[0])
          } else if (existingCreatorIndex !== -1 && !object.creator) {
            object.creator = existing.creator
            object.creator[existingCreatorIndex] = creator[0]
          } else if (existingContributorIndex !== -1 && !object.contributor) {
            object.contributor = existing.contributor
            object.contributor.splice(existingContributorIndex, 1)
            object.contributor.push(creator[0])
          } else {
            object.contributor = (object.contributor || existing.contributor || []).concat(creator)
          }
        }
      }
    }
  }
  return object
}

/**
 * Custom body parser middleware.
 * - For POSTs, adds body stream via json-anystream and adjusts objects via handleCreatorForObject.
 * - For PUT/PATCH/DELETE, parses JSON body, queries the existing entity which is saved in req.existing, checks creator, and adjusts object via handleCreatorForObject.
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
const bodyParser = (req, res, next) => {

  // Assemble creator once
  const creator = getCreator(req)

  // Wrap handleCreatorForObject method
  const adjust = (object, existing) => {
    return handleCreatorForObject({
      object,
      existing,
      creator,
      req,
    })
  }

  if (req.method == "POST") {
    // For POST requests, parse body with json-anystream middleware
    anystream.addStream(adjust)(req, res, next)
  } else {
    // For all other requests, parse as JSON
    express.json()(req, res, async (...params) => {
      // Get existing
      const uri = req.params._id || (req.body || {}).uri || req.query.uri
      let existing
      try {
        existing = await services[req.type].get(uri)
      } catch (error) {
        // Ignore
      }
      if (!existing) {
        next(new EntityNotFoundError(null, uri))
      } else {
        // Override certain properties with entities from database
        // Note: For POST request, this needs to be done individually in the services/{entity}.js file.
        if (["mappings", "annotations"].includes(req.type)) {
          await services.schemes.replaceSchemeProperties(req.body, ["fromScheme", "toScheme"])
          await services.schemes.replaceSchemeProperties(existing, ["fromScheme", "toScheme"])
        }
        let superordinated = {
          existing: null,
          payload: null,
        }
        // Check for superordinated object for existing (currently only `partOf`)
        if (req.type === "mappings" && existing.partOf && existing.partOf[0]) {
          // Get concordance via service
          try {
            const concordance = await services.concordances.get(existing.partOf[0].uri)
            superordinated.existing = concordance
          } catch (error) {
            const message = `Existing concordance with URI ${existing.partOf[0].uri} could not be found in database.`
            config.error(message)
            next(new DatabaseInconsistencyError(message))
          }
        }
        // Check superordinated object for payload
        if (req.type === "mappings" && req.body && req.body.partOf && req.body.partOf[0]) {
          // Get concordance via service
          try {
            const concordance = await services.concordances.get(req.body.partOf[0].uri)
            superordinated.payload = concordance
          } catch (error) {
            next(new InvalidBodyError(`Concordance with URI ${req.body.partOf[0].uri} could not be found.`))
          }
        }
        let creatorMatches = true
        if (superordinated.existing) {
          // creator or contributor must match for existing superordinated object
          creatorMatches = creatorMatches && matchesCreator({ req, object: superordinated.existing, withContributors: true })
        } else {
          // creator needs to match for object that is updated
          creatorMatches = creatorMatches && matchesCreator({ req, object: existing })
        }
        if (superordinated.payload) {
          // creator or contributor must also match for the payload's superordinated object
          creatorMatches = creatorMatches && matchesCreator({ req, object: superordinated.payload, withContributors: true })
        }
        if (!creatorMatches) {
          next(new CreatorDoesNotMatchError())
        } else {
          req.existing = existing
          req.body = adjust(req.body, existing)
          next(...params)
        }
      }
    })
  }
}

/**
 * Determines whether a query is actually empty (i.e. returns all documents).
 *
 * @param {*} query
 */
const isQueryEmpty = (query) => {
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

/**
 * Converts a MongoDB "find" query to an aggregation pipeline.
 *
 * In most cases, this will simply be a single $match stage, but there's special handling for
 * $nearSquere queries on the field `location` that is converted into a $geoNear stage.
 *
 * @param {*} query
 * @returns array with aggregation pipeline
 */
const queryToAggregation = (query) => {
  const pipeline = []
  // Transform location $nearSphere query into $geoNear aggregation stage
  if (query.location) {
    const locationQuery = query.location.$nearSphere
    pipeline.push({
      $geoNear: {
        spherical: true,
        maxDistance: locationQuery.$maxDistance,
        query: _.omit(query, ["location"]),
        near: locationQuery.$geometry,
        distanceField: "_distance",
      },
    })
  } else {
    pipeline.push({
      $match: query,
    })
  }
  return pipeline
}

/**
 * Returns the document count for a certain aggregation pipeline.
 * Uses estimatedDocumentCount() if possible (i.e. if the query is empty).
 *
 * @param {*} model a mongoose model
 * @param {*} pipeline an aggregation pipeline
 */
const count = async (model, pipeline) => {
  if (pipeline.length === 1 && pipeline[0].$match && isQueryEmpty(pipeline[0].$match)) {
    // It's an empty query, i.e. we can use estimatedDocumentCount()
    return await model.estimatedDocumentCount()
  } else {
    // Use aggregation instead
    return _.get(await model.aggregate(pipeline).count("count").exec(), "[0].count", 0)
  }
}

const bulkOperationForEntities = ({ entities, replace = true }) => {
  return entities.map(e => (replace ? {
    replaceOne: {
      filter: { _id: e._id },
      replacement: e,
      upsert: true,
    },
  } : {
    insertOne: {
      document: e,
    },
  }))
}

/**
 *
 * @param {Object} mapping mapping to be adjusted
 * @param {Object} [options]
 * @param {Object} [options.concordance] concordance object of mapping
 * @param {Object} [options.fromScheme] manual override for `fromScheme`
 * @param {Object} [options.toScheme] manual override for `toScheme`
 * @returns
 */
const addMappingSchemes = (mapping, options = {}) => {
  mapping && ["from", "to"].forEach(side => {
    const field = `${side}Scheme`
    if (mapping[field]) {
      return
    }
    if (options[field]) {
      mapping[field] = options[field]
      return
    }
    options.concordance = options.concordance || mapping.partOf?.[0]
    if (options.concordance?.[field]) {
      mapping[field] = options.concordance[field]
      return
    }
    const concepts = jskos.conceptsOfMapping(mapping, side)
    const schemeFromConcept = concepts.find(concept => concept?.inScheme?.[0]?.uri)?.inScheme[0]
    if (schemeFromConcept) {
      mapping[field] = schemeFromConcept
    }
  })
  return mapping
}

export {
  wrappers,
  cleanJSON,
  removeNullProperties,
  adjust,
  uuid,
  isValidUuid,
  matchesCreator,
  addDefaultHeaders,
  supportDownloadFormats,
  addMiddlewareProperties,
  addPaginationHeaders,
  returnJSON,
  handleDownload,
  bodyParser,
  searchHelper,
  getCreator,
  handleCreatorForObject,
  isQueryEmpty,
  queryToAggregation,
  count,
  bulkOperationForEntities,
  addMappingSchemes,
}
