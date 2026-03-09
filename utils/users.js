export function expandIdentities(identities, identityGroups) {
  if (identities && identityGroups) {
    return identities.map(uri => uri in identityGroups ? identityGroups[uri].identities : uri).flat()
  }
  return identities
}

export const getUrisOfUser = user =>
  [user || {}, ...Object.values(user?.identities || {})]
    .map(({uri}) => uri).filter(Boolean)

export const getUser = req => {
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
    const identity = Object.values(req?.user?.identities || {}).find(({uri}) => uri === user.uri) || req.user
    if (identity?.name) {
      user.name = identity.name
    }
  }

  return user
}

export const getCreator = req => {
  const { uri, name } = getUser(req)
  const creator = {}

  if (uri) {
    creator[req.type === "annotations" ? "id" : "uri"] = uri
  }
  if (name) {
    if (req.type === "annotations") {
      creator.name = name
    } else {
      creator.prefLabel ||= {}
      creator.prefLabel.en = name // TODO: why en?
    }
  }

  return uri || name ? creator : null
}


