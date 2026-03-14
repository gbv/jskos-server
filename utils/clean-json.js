import _ from "lodash"

/**
 * Recursively remove certain fields from response
 *
 * Gets called in `returnJSON` and `handleDownload`. Shouldn't be used anywhere else.
 *
 * @param {(Object|Object[])} json JSON object or array of objects
 * @param {number} [depth=0] Should not be set when called from outside
 */
export function cleanJSON(json, depth = 0) {
  if (Array.isArray(json)) {
    json.forEach(value => cleanJSON(value, depth))
  } else if (_.isObject(json)) {
    _.forOwn(json, (value, key) => {
      if (key.startsWith("_")) {
        _.unset(json, key)
      } else {
        cleanJSON(value, depth + 1)
      }
    })
  }
}
