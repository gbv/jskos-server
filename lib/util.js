const _ = require("lodash")

/**
 * Handles the properties query parameter for concept methods.
 * Currently only handles properties `narrower` and `ancestors`.
 *
 * @param {TerminologyProvider} provider - the current terminology provider
 * @param {Array} results - the results to be modified
 * @param {String} properties - the query properties
 */
function handleProperties(provider, results, properties) {
  let promises = []
  properties = (properties || "").split(",")
  if (properties.includes("narrower")) {
    // Load narrower for each concept
    for (let concept of results) {
      promises.push(provider._getNarrower(concept.uri).then(results => {
        concept.narrower = results
      }))
    }
  }
  if (properties.includes("ancestors")) {
    // Load ancestors for each concept
    for (let concept of results) {
      promises.push(provider._getAncestors(concept.uri).then(results => {
        concept.ancestors = results
      }))
    }
  }
  return Promise.all(promises).then(() => {
    return results
  })
}

function getBaseUrl(req, trailingSlash = true) {
  let path = req.protocol + "://" + req.get("host")
  if (trailingSlash && !path.endsWith("/")) {
    path += "/"
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
 * Returns the current authorized username for the request. `null` if there is no authorization.
 *
 * @param {*} req
 */
function getUsername(req) {
  return req.auth && req.auth.user ? Buffer.from(req.auth.user, "base64").toString("ascii") : null
}

module.exports = {
  handleProperties,
  getBaseUrl,
  setPaginationHeaders,
  uuid,
  getUsername,
}
