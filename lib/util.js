const _ = require("lodash")
const config = require("../config")

/**
 * Handles the properties query parameter for concept methods.
 * Currently only handles properties `narrower`, `ancestors`, and `annotations`.
 *
 * @param {Object} providers - an object with providers, e.g. { terminologyProvider, annotationProvider }
 * @param {Array} object - the object to be modified (e.g. a concept, a mapping)
 * @param {String} properties - the query properties
 */
function handleProperties(providers, object, properties) {
  let promises = []
  properties = (properties || "").split(",")
  if (properties.includes("narrower") && providers.terminologyProvider) {
    // Load narrower for concept
    promises.push(providers.terminologyProvider._getNarrower(object.uri).then(results => {
      object.narrower = results
    }))
  }
  if (properties.includes("ancestors") && providers.terminologyProvider) {
    // Load ancestors for concept
    promises.push(providers.terminologyProvider._getAncestors(object.uri).then(results => {
      object.ancestors = results
    }))
  }
  if (properties.includes("annotations") && providers.annotationProvider && object.uri) {
    // Load annotations for object (via it's URI)
    promises.push(providers.annotationProvider.getAnnotations({ query: { target: object.uri }}).then(results => {
      for (let annotation of results) {
        adjustAnnotation()(annotation)
      }
      object.annotations = results
    }))
  }
  return Promise.all(promises).then(() => {
    return object
  })
}

function getBaseUrl(req, trailingSlash = true) {
  let path
  if (config.baseUrl) {
    path = config.baseUrl
  } else {
    path = req.protocol + "://" + req.get("host")
  }
  if (trailingSlash && !path.endsWith("/")) {
    // Add trailing slash
    path += "/"
  } else if (!trailingSlash && path.endsWith("/")) {
    // Remove trailing slash
    path = path.substring(0, path.length - 1)
  }
  return path
}

/**
 * Sets pagination headers (X-Total-Count, Link) for a response.
 * See also: https://developer.github.com/v3/#pagination
 * For Link header rels:
 * - first and last are always set
 * - prev will be set if previous page exists (i.e. if offset > 0)
 * - next will be set if next page exists (i.e. if offset + limit < total)
 *
 * All properties (req, res, limit, offset, total) are required.
 */
function setPaginationHeaders({ req, res, limit, offset, total }) {
  if (req == null || res == null || limit == null || offset == null || total == null) {
    return
  }
  function url(baseUrl, query, rel) {
    let url = baseUrl
    let index = 0
    _.forOwn(query, (value, key) => {
      url += `${(index == 0 ? "?" : "&")}${key}=${value}`
      index += 1
    })
    return `<${url}>; rel="${rel}"`
  }
  // Set X-Total-Count header
  res.set("X-Total-Count", total)
  let links = []
  let baseUrl = getBaseUrl(req, false) + req.path
  let query = _.cloneDeep(req.query)
  query.limit = limit
  // rel: first
  query.offset = 0
  links.push(url(baseUrl, query, "first"))
  // rel: prev
  if (offset > 0) {
    query.offset = Math.max(offset - limit, 0)
    links.push(url(baseUrl, query, "prev"))
  }
  // rel: next
  if (limit + offset < total) {
    query.offset = offset + limit
    links.push(url(baseUrl, query, "next"))
  }
  // rel: last
  let current = 0
  while (current + limit < total) {
    current += limit
  }
  query.offset = current
  links.push(url(baseUrl, query, "last"))
  // Set Link header
  res.set("Link", links.join(","))
}

/**
 * Returns a random v4 UUID.
 *
 * from: https://gist.github.com/jed/982883
 */
function uuid(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,uuid)}

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

function adjustAnnotation() {
  return annotation => {
    if (!annotation) {
      return null
    }
    // Remove MongoDB specific fields, add JSKOS specific fields
    delete annotation._id
    annotation["@context"] = "http://www.w3.org/ns/anno.jsonld"
    annotation.type = "Annotation"
    return annotation
  }
}

module.exports = {
  handleProperties,
  getBaseUrl,
  setPaginationHeaders,
  uuid,
  matchesCreator,
  adjustAnnotation,
}
