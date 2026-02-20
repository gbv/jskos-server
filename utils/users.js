import _ from "lodash"

export const getUrisOfUser = user => {
  if (!user) {
    return []
  }
  return [user.uri].concat(Object.values(user.identities || {})
    .map(identity => identity.uri)).filter(uri => uri)
}

/**
 * Extracts a creator objects from a request.
 *
 * @param {*} req request object
 */
export const getCreator = (req) => {
  const user = getUser(req)

  const creator = {}

  if (user.uri) {
    const creatorUriPath = req.type === "annotations" ? "id" : "uri"
    _.set(creator, creatorUriPath, user.uri)
  }
  if (user.name) {
    const creatorNamePath = req.type === "annotations" ? "name" : "prefLabel.en"
    _.set(creator, creatorNamePath, user.name)
  }

  return user.uri || user.name ? creator : null
}

export const getUser = (req) => {
  const user = {}

  const userUris = getUrisOfUser(req.user)
  if (req.user && !userUris.includes(req.query.identity)) {
    user.uri = req.user.uri
  } else if (req.query.identity) {
    user.uri = req.query.identity
  }

  if (req.query.identityName) {
    user.name = req.query.identityName
  } else if (req.query.identityName !== "") {
    const name = _.get(Object.values(_.get(req, "user.identities", [])).find(i => i.uri === user.uri) || req.user, "name")
    if (name) {
      user.name = name
    }
  }

  return user
}
