/**
 * Middleware that adds default properties:
 *
 * - If req.query exists, make sure req.query.limit and req.query.offset are set as numbers and make req.bulk a Boolean.
 * - If possible, set req.type depending on the endpoint (one of concepts, schemes, mappings, annotations, suggest).
 */
export const addMiddlewareProperties = config => (req, res, next) => {

  if (req.query) {
    const query = { ...req.query }

    // Limit for pagination
    const defaultLimit = 100
    query.limit = parseInt(req.query.limit)
    if (isNaN(query.limit) || req.query.limit <= 0) {
      query.limit = defaultLimit
    }
    // Offset for pagination
    const defaultOffset = 0
    query.offset = parseInt(req.query.offset)
    if (isNaN(query.offset) || req.query.offset < 0) {
      query.offset = defaultOffset
    }
    // Bulk option for POST endpoints
    query.bulk = query.bulk === "true" || query.bulk === "1"

    // req.query is read-only since Express 5, so this is a hack.
    // better create a custom query parser instead
    // See <https://stackoverflow.com/questions/79597051/is-there-any-way-to-modify-req-query-in-express-v5>
    Object.defineProperty(
      req,
      "query",
      {
        ...Object.getOwnPropertyDescriptor(req, "query"),
        writable: false,
        value: query,
      })
  }

  // req.path -> req.type
  let type = req.path.substring(1)
  type = type.substring(0, type.indexOf("/") == -1 ? type.length : type.indexOf("/"))
  if (type == "voc") {
    if (req.path.includes("/top") || (req.path.includes("/concepts") && req.method !== "DELETE")) {
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
  if (type == "suggest" && req?.query?.format?.toLowerCase() == "jskos") {
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


