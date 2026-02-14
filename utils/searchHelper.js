import _ from "lodash"
import jskos from "jskos-tools"

// from https://web.archive.org/web/20170609122132/http://jam.sg/blog/efficient-partial-keyword-searches/
export function makeSuffixes(values) {
  const results = []
  values.forEach(function (val) {
    val = val.toUpperCase().trim()
    let tmp, hasSuffix
    for (let i = 0; i < val.length - 1; i++) {
      tmp = val.substr(i)
      hasSuffix = results.includes(tmp)
      if (!hasSuffix) {
        results.push(tmp)
      }
    }
  })
  return results
}
// adapted from above
export function makePrefixes(values) {
  const results = []
  values.forEach(function (val) {
    val = val.toUpperCase().trim()
    let tmp, hasPrefix
    results.push(val)
    for (let i = 2; i < val.length; i++) {
      tmp = val.substr(0, i)
      hasPrefix = results.includes(tmp)
      if (!hasPrefix) {
        results.push(tmp)
      }
    }
  })
  return results
}

/**
 * Enumerates and sorts all labels (prefLabel and altLabel) in an item.
 *
 * Sorting:
 * - prefLabel over altLabel
 * - provided language over other languages
 * - other languages by the order of the `languages` property of the item if available
 *
 * @param {Object} item JSKOS item (scheme or concept)
 */
export function getAllLabelsSorted(item, language = "en") {
  function extractAndSortLabels(labels, languages) {
    return _.toPairs(labels).sort((a, b) => {
      const bIndex = languages.indexOf(b[0]), aIndex = languages.indexOf(a[0])
      if (bIndex === -1) {
        return -1
      }
      if (aIndex === -1) {
        return 1
      }
      return aIndex - bIndex
    }).map(v => v[1])
  }
  const languages = [language].concat(item.languages || [])
  return _.flattenDeep(extractAndSortLabels(item.prefLabel || {}, languages).concat(extractAndSortLabels(item.altLabel || {}, languages)))
}

/**
 * Adds necessary properties required by indexes for search.
 *
 * @param {Object} item JSKOS item (scheme or concept)
 */
export function addKeywords(item) {
  item._keywordsNotation = makePrefixes(item.notation || [])
  // Do not write text index keywords for synthetic concepts
  if (!item.type || !item.type.includes("http://rdf-vocabulary.ddialliance.org/xkos#CombinedConcept")) {
    // Labels
    // Assemble all labels
    let labels = getAllLabelsSorted(item)
    // Split labels by space and dash
    item._keywordsLabels = makeSuffixes(labels)
    // Other properties
    item._keywordsOther = []
    for (let map of (item.creator || []).concat(item.scopeNote, item.editorialNote, item.definition)) {
      if (map) {
        item._keywordsOther = item._keywordsOther.concat(Object.values(map))
      }
    }
    // Make sure to flatten both arrays and objects
    item._keywordsOther = _.flattenDeep(item._keywordsOther)
    item._keywordsOther = item._keywordsOther.map(v => {
      if (_.isObject(v)) {
        return Object.values(v)
      }
      return v
    })
    item._keywordsOther = _.flattenDeep(item._keywordsOther)
    if (item.publisher) {
      item._keywordsPublisher = _.flattenDeep(
        item.publisher.map(publisher => {
          return [publisher.uri].concat(Object.values(publisher.prefLabel || {}))
        }),
      )
    }
  }
}

/**
 * Converts search results to Open Search Suggest Format for /suggest endpoints.
 *
 * @param {Object} options.query query object for request
 * @param {Array} options.results results as JSKOS array
 */
export function toOpenSearchSuggestFormat({ query, results }) {
  // Transform to OpenSearch Suggest Format
  let labels = []
  let descriptions = []
  let uris = []
  let currentOffset = query.offset
  for (let result of results) {
    // Skip if offset is not reached
    if (currentOffset) {
      currentOffset -= 1
      continue
    }
    // Skip if limit is reached
    if (labels.length >= query.limit) {
      break
    }
    // Determine prefLabel via `language` parameter
    const language = (query.language || "").split(",").filter(lang => lang)
    let prefLabel
    for (const lang of language) {
      prefLabel = _.get(result, `prefLabel.${lang}`)
      if (prefLabel) {
        break
      }
    }
    if (!prefLabel) {
      prefLabel = jskos.prefLabel(result, { fallbackToUri: false })
    }
    let label = jskos.notation(result)
    if (label && prefLabel) {
      label += " "
    }
    label += prefLabel
    labels.push(label) // + " (" + result.priority + ")")
    descriptions.push("")
    uris.push(result.uri)
  }
  const searchResults = [
    query.search, labels, descriptions, uris,
  ]
  searchResults.totalCount = results.length
  return searchResults
}
