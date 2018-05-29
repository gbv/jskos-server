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
    var criteria = ["from", "to"].filter(uri => query[uri]).map(part => {
      let set = {}, choice = {}
      set[`${part}.memberSet`] = { "$elemMatch": { "uri": query[part] } }
      choice[`${part}.memberChoice`] = { "$elemMatch": { "uri": query[part] } }
      return { $or: [ set, choice ] }
    }
    )
    return this.collection.find(criteria.length ? { $and: criteria } : {})
      .toArray()
  }
}

module.exports = MappingProvider
