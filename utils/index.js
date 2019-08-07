const config = require("../config")
const _ = require("lodash")
const jskos = require("jskos-tools")

const wrappers = {

  // adjusted from: https://thecodebarbarian.com/80-20-guide-to-express-error-handling
  async(fn) {
    return (req, res, next) => {
      fn(req, res, next).then(data => {
        // On success, save the result of the Promise in req.data.
        req.data = data
        next()
      }).catch(error => {
        // On error, pass error to the next error middleware.
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

// Recursively remove all fields starting with _ from response
const cleanJSON = (json) => {
  if (_.isArray(json)) {
    json.forEach(cleanJSON)
  } else if (_.isObject(json)) {
    _.forOwn(json, (value, key) => {
      if (key.startsWith("_")) {
        // remove from object
        _.unset(json, key)
      } else {
        cleanJSON(value)
      }
    })
  }
}

// Services needed to load properties
const Container = require("typedi").Container

// Adjust data in req.data based on req.type
const adjust = async (req, res, next) => {
  if (!req.data || !req.type) {
    next()
  }
  let type = req.type
  // Remove "s" from the end of type if it's not an array
  if (!_.isArray(req.data)) {
    type = type.substring(0, type.length - 1)
  }
  if (adjust[type]) {
    req.data = await adjust[type](req.data, (_.get(req, "query.properties", "").split(",")))
  }
  next()
}

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

adjust.concept = async (concept, properties = []) => {
  if (concept) {
    concept["@context"] = "https://gbv.github.io/jskos/context.json"
    concept.type = concept.type || ["http://www.w3.org/2004/02/skos/core#Concept"]
    // Add properties (narrower, ancestors)
    for (let property of ["narrower", "ancestors"].filter(p => properties.includes(p))) {
      const conceptService = Container.get(require("../services/concepts"))
      concept[property] = await Promise.all((await conceptService[`get${property.charAt(0).toUpperCase() + property.slice(1)}`]({ uri: concept.uri })).map(concept => adjust.concept(concept)))
    }
    // Add properties (annotations)
    if (properties.includes("annotations") && concept.uri) {
      const annotationService = Container.get(require("../services/annotations"))
      concept.annotations = (await annotationService.getAnnotations({ target: concept.uri })).map(annotation => adjust.annotation(annotation))
    }
  }
  return concept
}
adjust.concepts = async (concepts, properties) => {
  return await Promise.all(concepts.map(concept => adjust.concept(concept, properties)))
}

adjust.concordance = (concordance) => {
  if (concordance) {
    concordance["@context"] = "https://gbv.github.io/jskos/context.json"
  }
  return concordance
}
adjust.concordances = (concordances) => {
  return concordances.map(concordance => adjust.concordance(concordance))
}

adjust.mapping = async (mapping, properties = []) => {
  if (mapping) {
    mapping["@context"] = "https://gbv.github.io/jskos/context.json"
    // Add properties (annotations)
    if (properties.includes("annotations") && mapping.uri) {
      const annotationService = Container.get(require("../services/annotations"))
      mapping.annotations = (await annotationService.getAnnotations({ target: mapping.uri })).map(annotation => adjust.annotation(annotation))
    }
  }
  return mapping
}
adjust.mappings = async (mappings, properties) => {
  return await Promise.all(mappings.map(mapping => adjust.mapping(mapping, properties)))
}

adjust.scheme = (scheme) => {
  scheme["@context"] = "https://gbv.github.io/jskos/context.json"
  scheme.type = scheme.type || ["http://www.w3.org/2004/02/skos/core#ConceptScheme"]
  return scheme
}
adjust.schemes = (schemes) => {
  return schemes.map(scheme => adjust.scheme(scheme))
}

/**
 * Returns a random v4 UUID.
 *
 * TODO: Replace with uuid module.
 *
 * from: https://gist.github.com/jed/982883
 */
function uuid(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,uuid)}

const uuidRegex = new RegExp(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i)
function isValidUuid(uuid) {
  return uuid.match(uuidRegex) != null
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
 * @param {object} user the user object (e.g. req.user)
 * @param {object} object any object that has the property `creator`
 */
function matchesCreator(user, object) {
  if (!object || !user) {
    return false
  }
  // If config.auth.allowCrossUserEditing is enabled, return true
  if (config.auth.allowCrossUserEditing) {
    return true
  }
  // If not, check URIs
  const userUris = [user.uri].concat(Object.values(user.identities || {}).map(identity => identity.uri)).filter(uri => uri != null)
  // Support arrays, objects, and strings as creators
  let creators = _.isArray(object.creator) ? object.creator : (_.isObject(object.creator) ? [object.creator] : [{ uri: object.creator }])
  for (let creator of creators) {
    if (userUris.includes(creator.uri) || userUris.includes(creator.id)) {
      return true
    }
  }
  return false
}

const addDefaultHeaders = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,PATCH,DELETE")
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Link")
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  next()
}

const addMiddlewareProperties = (req, res, next) => {
  if (req.query) {
    // Limit for pagination
    const defaultLimit = 100
    req.query.limit = parseInt(req.query.limit)
    req.query.limit = Math.min(defaultLimit, req.query.limit || defaultLimit)
    // Offset for pagination
    const defaultOffset = 0
    req.query.offset = parseInt(req.query.offset)
    req.query.offset = req.query.offset || defaultOffset
  }
  // baseUrl
  let baseUrl = config.baseUrl || (req.protocol + "://" + req.get("host"))
  if (!baseUrl.endsWith("/")) {
    // Add trailing slash
    baseUrl += "/"
  }
  req.myBaseUrl = baseUrl
  // req.path -> req.type
  let type = req.path.substring(1)
  type = type.substring(0, type.indexOf("/") == -1 ? type.length : type.indexOf("/") )
  if (type == "voc") {
    if (req.path.includes("/top") || req.path.includes("/concepts")) {
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
  // TODO: /data can return schemes as well.
  if (["data", "narrower", "ancestors", "search"].includes(type)) {
    type = "concepts"
  }
  if (type == "suggest" && _.get(req, "query.format", "").toLowerCase() == "jskos") {
    type = "concepts"
  }
  req.type = type
  next()
}

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
 */
const addPaginationHeaders = (req, res, next) => {
  const limit = req.query.limit
  const offset = req.query.offset
  const total = (req.data && req.data.totalCount) || (req.data && req.data.length)
  if (req == null || res == null || limit == null || offset == null || total == null) {
    return
  }
  const baseUrl = req.myBaseUrl.substring(0, req.myBaseUrl.length - 1) + req.path
  const url = (query, rel) => {
    let url = baseUrl
    let index = 0
    _.forOwn(query, (value, key) => {
      url += `${(index == 0 ? "?" : "&")}${key}=${encodeURIComponent(value)}`
      index += 1
    })
    return `<${url}>; rel="${rel}"`
  }
  // Set X-Total-Count header
  res.set("X-Total-Count", total)
  let links = []
  let query = _.cloneDeep(req.query)
  query.limit = limit
  // rel: first
  query.offset = 0
  links.push(url(query, "first"))
  // rel: prev
  if (offset > 0) {
    query.offset = Math.max(offset - limit, 0)
    links.push(url(query, "prev"))
  }
  // rel: next
  if (limit + offset < total) {
    query.offset = offset + limit
    links.push(url(query, "next"))
  }
  // rel: last
  let current = 0
  while (current + limit < total) {
    current += limit
  }
  query.offset = current
  links.push(url(query, "last"))
  // Set Link header
  res.set("Link", links.join(","))
  next()
}

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

const { Transform } = require("stream")
const JSONStream = require("JSONStream")
const handleDownload = (filename) => (req, res) => {
  const results = req.data
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
  let transform = JSONStream.stringify("[\n", ",\n", "\n]\n")
  let fileEnding = "json"
  let first = true, delimiter = ","
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
      transform = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
        // Small workaround to prepend a line to CSV
          if (first) {
            this.push(`"fromNotation"${delimiter}"toNotation"${delimiter}"type"\n`)
            first = false
          }
          let mappingToCSV = jskos.mappingToCSV({
            lineTerminator: "\r\n",
            delimiter,
          })
          this.push(mappingToCSV(chunk))
          callback()
        },
      })
      break
  }
  // Add file header
  res.set("Content-disposition", `attachment; filename=${filename}.${fileEnding}`)
  // results is a database cursor
  results.stream()
    .pipe(removeIdTransform)
    .pipe(transform)
    .pipe(res)
}

module.exports = {
  wrappers,
  cleanJSON,
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
}
