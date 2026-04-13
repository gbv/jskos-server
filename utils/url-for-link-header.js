import _ from "lodash"

export function urlForLinkHeader({ base, query, rel, req }) {
  let url = base.substring(0, base.length - 1) + req.path
  // eslint-disable-next-line no-unused-vars
  const { bulk, ...vars } = query || req?.query || {} // omit "bulk"
  let index = 0
  _.forOwn(vars, (value, key) => {
    url += `${(index == 0 ? "?" : "&")}${key}=${encodeURIComponent(value)}`
    index += 1
  })
  return `<${url}>; rel="${rel}"`
}
