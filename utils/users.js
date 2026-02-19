export const getUrisOfUser = user => {
  if (!user) {
    return []
  }
  return [user.uri].concat(Object.values(user.identities || {})
    .map(identity => identity.uri)).filter(uri => uri)
}
