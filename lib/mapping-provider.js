const _ = require("lodash")

/**
 * Provide Mappings stored in a MongoDB collection.
 */
class MappingProvider {

  constructor(collection) {
    this.collection = collection
  }

  /**
   * Return a Promise with an array of mappings.
   */
  getMappings(query) {
    let limit = parseInt(query["limit"])
    if (isNaN(limit)) {
      limit = 100
    }
    var criteria = ["from", "to"].filter(uri => query[uri]).map(part => {
      let set = {}, choice = {}, setNotation = {}, choiceNotation = {}
      set[`${part}.memberSet.uri`] = decodeURIComponent(query[part])
      choice[`${part}.memberChoice.uri`] = decodeURIComponent(query[part])
      setNotation[`${part}.memberSet.notation`] = decodeURIComponent(query[part])
      choiceNotation[`${part}.memberChoice.notation`] = decodeURIComponent(query[part])
      return { $or: [ set, choice, setNotation, choiceNotation ] }
    })
    return this.collection.find(criteria.length ? { $and: criteria } : {})
      .limit(limit)
      .toArray()
  }

  /**
   * Returns a promise with suggestions in OpenSearch Suggest Format
   */
  getNotationSuggestions(query) {
    let limit = parseInt(query.limit) || 100
    let search = query.search
    if (!search || search.length == 0) {
      return Promise.resolve(["", [], [], []])
    }
    let vocs = query.voc && query.voc.split("|")
    let mongoQuery, and = [], or = []
    // Scheme restrictions
    // FIXME: Currently, this allows the scheme to be anywhere in the mapping.
    // Restrict it to the side where the notation is searched.
    if (vocs && vocs.length) {
      let vocOr = []
      for (let voc of vocs) {
        vocOr.push({ "fromScheme.uri": voc })
        vocOr.push({ "fromScheme.notation": voc })
        vocOr.push({ "toScheme.uri": voc })
        vocOr.push({ "toScheme.notation": voc })
      }
      and.push({ $or: vocOr })
    }
    // Notations
    // TODO: - Implement mode.
    let paths = ["from.memberSet", "to.memberSet", "to.memberList", "to.memberChoice"]
    for (let path of paths) {
      or.push({ [path + ".notation"]: { $regex: `^${search}` } })
    }
    and.push({ $or: or })
    mongoQuery = { $and: and }
    console.log("getNotationSuggestions:", mongoQuery)
    return this.collection.find(mongoQuery).toArray().then(mappings => {
      console.log(mappings.length)
      let results = []
      let descriptions = []
      for (let mapping of mappings) {
        for (let path of paths) {
          let concepts = _.get(mapping, path, null)
          if (!concepts) continue
          let notations = []
          for (let concept of concepts) {
            notations = notations.concat(concept.notation)
          }
          for (let notation of notations) {
            if (_.lowerCase(notation).startsWith(_.lowerCase(search))) {
              let index = results.indexOf(notation)
              if (index == -1) {
                results.push(notation)
                descriptions.push(1)
              } else {
                descriptions[index] += 1
              }
            }
          }
        }
      }
      let zippedResults = _.zip(results, descriptions)
      zippedResults.sort((a, b) => {
        return b[1] - a[1] || a[0] > b[0]
      })
      let unzippedResults = _.unzip(zippedResults.slice(0, limit))
      console.log(results, descriptions)
      return [
        search,
        unzippedResults[0] || [],
        unzippedResults[1] || [],
        []
      ]
    })
  }
}

module.exports = MappingProvider
