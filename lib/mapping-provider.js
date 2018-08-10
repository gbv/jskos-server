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
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    var criteria = ["from", "to"].filter(uri => query[uri]).map(part => {
      let set = {}, choice = {}, setNotation = {}, choiceNotation = {}
      set[`${part}.memberSet.uri`] = decodeURIComponent(query[part])
      choice[`${part}.memberChoice.uri`] = decodeURIComponent(query[part])
      setNotation[`${part}.memberSet.notation`] = decodeURIComponent(query[part])
      choiceNotation[`${part}.memberChoice.notation`] = decodeURIComponent(query[part])
      return { $or: [ set, choice, setNotation, choiceNotation ] }
    })
    // Note: This should only be applied to "from" and "to", not to future parameters like "fromScheme" or "toScheme".
    let mode = query.mode
    if (!["and", "or"].includes(mode)) {
      mode = "and"
    }
    let mongoQuery1 = criteria.length ? { [`$${mode}`]: criteria } : {}
    // fromScheme / toScheme
    criteria = ["fromScheme", "toScheme"].filter(uri => query[uri]).map(part => {
      let uri = {}, notation = {}
      uri[`${part}.uri`] = decodeURIComponent(query[part])
      notation[`${part}.notation`] = decodeURIComponent(query[part])
      return { $or: [ uri, notation ] }
    })
    let mongoQuery2 = criteria.length ? { $and: criteria } : {}

    return this.collection.find({ $and: [mongoQuery1, mongoQuery2] }).skip(offset).limit(limit).toArray()
  }

  /**
   * Returns a promise with an array of concept schemes.
   */
  getMappingSchemes(query) {
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    // TODO: Optimize MongoDB queries
    let match = []
    if (query.from) {
      match.push({
        $or: [{
          "from.memberSet.uri": query.from
        }, {
          "from.memberSet.notation": query.from
        }]
      })
    }
    if (query.to) {
      match.push({
        $or: [{
          "to.memberSet.uri": query.to
        }, {
          "to.memberSet.notation": query.to
        },{
          "to.memberChoice.uri": query.to
        }, {
          "to.memberChoice.notation": query.to
        }]
      })
    }
    if (!match.length) {
      match = [{}]
    }
    let mode = query.mode
    if (!["and", "or"].includes(mode)) {
      // default: $or
      mode = "or"
    }
    match = { $match: { [`$${mode}`]: match } }
    let promises = [
      this.collection.aggregate([
        match,
        {
          $group: {
            _id: "$fromScheme",
            "count": { "$sum": 1 }
          }
        }
      ]).toArray(),
      this.collection.aggregate([
        match,
        {
          $group: {
            _id: "$toScheme",
            "count": { "$sum": 1 }
          }
        }
      ]).toArray()
    ]
    let schemes = {}
    return Promise.all(promises).then(results => {
      for (let result of results[0]) {
        // fromScheme counts
        schemes[result._id.uri] = result._id
        schemes[result._id.uri].fromCount = parseInt(result.count) || 0
      }
      for (let result of results[1]) {
        // toScheme counts
        schemes[result._id.uri] = schemes[result._id.uri] || result._id
        schemes[result._id.uri].toCount = parseInt(result.count) || 0
      }
      return Object.values(schemes).slice(offset, offset+limit)
    })
  }

  /**
   * Returns a promise with suggestions in OpenSearch Suggest Format
   */
  getNotationSuggestions(query) {
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
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
    return this.collection.find(mongoQuery).toArray().then(mappings => {
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
      let unzippedResults = _.unzip(zippedResults.slice(offset, offset+limit))
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
