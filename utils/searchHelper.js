import _ from "lodash"
import config from "../config/index.js"
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
 * Helper method used by search/suggest endpoints for schemes and concepts.
 *
 * @param {string} options.search search string
 * @param {string} options.voc optional vocabulary URI
 * @param {SchemeService} options.schemeService scheme service reference for getting vocabulary details
 * @param {Function} options.queryFunction async function that takes a query object and returns results as an array
 */
export async function searchItem({ search, voc, schemeService, queryFunction }) {
  // Don't try to search for an empty query
  if (!search.length) {
    return []
  }
  // Prepare search query for use in regex
  const searchRegExp = new RegExp(`^${_.escapeRegExp(search).toUpperCase()}`)
  let query, queryOr = [{ _id: search }]
  // let projectAndSort = {}
  if (search.length > 2) {
    // Use text search for queries longer than two characters
    queryOr.push({
      $text: {
        $search: "\"" + search + "\"",
      },
    })
    // Projekt and sort on text score
    // projectAndSort = { score: { $meta: "textScore" } }
  }
  if (search.length <= 2) {
    // Search for notations specifically for one or two characters
    queryOr.push({
      _keywordsNotation: {
        $regex: searchRegExp,
      },
    })
  }
  if (search.length > 1) {
    // Search _keywordsLabels
    // TODO: Rethink this approach.
    queryOr.push({ _keywordsLabels: { $regex: searchRegExp } })
  }
  // Also search for exact matches with the URI (in field _id)
  query = { $or: queryOr }
  // Filter by scheme uri
  if (voc && schemeService) {
    let uris
    // Get scheme from database
    let scheme = await schemeService.getScheme(voc)
    if (scheme) {
      uris = [scheme.uri].concat(scheme.identifier || [])
    } else {
      uris = [query.uri]
    }
    query = { $and: [query, { $or: uris.map(uri => ({ "inScheme.uri": uri })) }] }
  }
  let results = await queryFunction(query)
  let _search = search.toUpperCase()
  // Prioritize results
  for (let result of results) {
    let priority = 100
    if (result.notation && result.notation.length > 0) {
      let _notation = jskos.notation(result).toUpperCase()
      // Shorter notation equals higher priority
      priority -= _notation.length
      // Notation equals search means highest priority
      if (_search == _notation) {
        priority += 1000
      }
      // Notation starts with serach means higher priority
      if (_notation.startsWith(_search)) {
        priority += 150
      }
    }
    // prefLabel/altLabel equals search means very higher priority
    for (let [labelType, factor] of [["prefLabel", 2.0], ["altLabel", 1.0], ["creator.prefLabel", 0.8], ["definition", 0.7]]) {
      let labels = []
      // Collect all labels
      for (let label of Object.values(_.get(result, labelType, {}))) {
        if (Array.isArray(label)) {
          labels = labels.concat(label)
        } else {
          labels.push(label)
        }
      }
      let matchCount = 0
      let priorityDiff = 0
      for (let label of labels) {
        let _label
        try {
          _label = label.toUpperCase()
        } catch (error) {
          config.error(label, error)
          continue
        }
        if (_search == _label) {
          priorityDiff += 100
          matchCount += 1
        } else if (_label.startsWith(_search)) {
          priorityDiff += 50
          matchCount += 1
        } else if (_label.indexOf(_search) > 0) {
          priorityDiff += 15
          matchCount += 1
        }
      }
      matchCount = Math.pow(matchCount, 2) || 1
      priority += priorityDiff * (factor / matchCount)
    }
    result.priority = priority
  }
  // Sort results first by priority, then by notation
  results = results.sort((a, b) => {
    if (a.priority != b.priority) {
      return b.priority - a.priority
    }
    if (a.notation && a.notation.length && b.notation && b.notation.length) {
      if (jskos.notation(b) > jskos.notation(a)) {
        return -1
      } else {
        return 1
      }
    } else {
      return 0
    }
  })
  return results
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
