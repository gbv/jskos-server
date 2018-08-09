/**
 * Provide statistics and connection status.
 */
class StatusProvider {

  constructor(db) {
    this.db = db
  }

  getStatus() {
    let value
    return this.db.stats().then(result => {
      value = result
      return this.db.listCollections().toArray()
    }).then(results => {
      let collectionNames = results.reduce((total, current) => {
        total.push(current.name)
        return total
      }, [])
      let promises = []
      for (let collection of collectionNames) {
        promises.push(this.db.collection(collection).stats().then(result => {
          result.name = collection
          return result
        }))
      }
      return Promise.all(promises)
    }).then(results => {
      value.collections = results
      return value
    }).catch(error => {
      console.log("Error on /status:", error)
      return {
        ok: 0
      }
    })
  }

}

module.exports = StatusProvider
