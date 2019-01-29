const util = require("./util")
const _ = require("lodash")
const config = require("../config")

/**
 * Provide annotations stored in a MongoDB collection.
 */
class AnnotationProvider {

  constructor(collection) {
    this.collection = collection
  }

  /**
   * Returns a Promise with an array of annotations.
   *
   * TODO: Add sorting.
   */
  getAnnotations(req, res) {
    let query = req.query
    let limit = parseInt(query.limit) || 100
    let offset = parseInt(query.offset) || 0
    let criteria = []
    if (query.id) {
      criteria.push({
        $or: [
          {
            "_id": query.id
          },
          {
            "id": query.id
          }
        ]
      })
    }
    if (query.creator) {
      criteria.push({
        creator: query.creator
      })
    }
    if (query.target) {
      criteria.push({
        target: query.target
      })
    }
    if (query.bodyValue) {
      criteria.push({
        bodyValue: query.bodyValue
      })
    }
    if (query.motivation) {
      criteria.push({
        motivation: query.motivation
      })
    }
    let cursor = this.collection.find(criteria.length ? { $and: criteria } : {})
    return cursor.count().then(total => {
      // Add headers
      util.setPaginationHeaders({ req, res, limit, offset, total })
      return cursor.skip(offset).limit(limit).toArray()
    })
  }

  /**
   * Returns a promise with a single annotation with id in req.params._id.
   */
  getAnnotation(req) {
    let _id = req.params._id
    if (!_id) {
      return Promise.resolve(null)
    }
    return this.collection.findOne({ _id })
  }

  /**
   * Save a new annotation in the database. Adds created date if necessary.
   */
  postAnnotation(req) {
    let annotation = req.body
    let username = util.getUsername(req)
    if (!annotation || !username) {
      return Promise.resolve(null)
    }
    // Set creator
    annotation.creator = username
    // Add created and modified dates.
    let date = (new Date()).toISOString()
    if (!annotation.created) {
      annotation.created = date
    }
    // Remove type property
    _.unset(annotation, "type")
    // TODO: Validate annotation

    // Add _id and URI
    annotation._id = util.uuid()
    annotation.id = util.getBaseUrl(req) + "annotations/" + annotation._id
    // Make sure URI is a https URI (except in tests)
    if (!config.env == "test") {
      annotation.uri.replace("http:", "https:")
    }
    // Save annotation
    return this.collection.insertOne(annotation)
      .then(() => {
        return annotation
      })
      .catch(error => {
        console.log(error)
        return null
      })
  }

  putAnnotation(req) {
    let annotation = req.body
    let username = util.getUsername(req)
    if (!annotation) {
      return Promise.resolve(null)
    }
    // Add modified date.
    let date = (new Date()).toISOString()
    annotation.modified = date
    // Remove type property
    _.unset(annotation, "type")
    // TODO: Validate annotation

    return this.getAnnotation(req).then(existingAnnotation => {
      if (!existingAnnotation) {
        return null
      }
      if (existingAnnotation.creator != username) {
        // TODO: Return unauthorized error.
        return null
      }
      // Always preserve certain existing properties
      annotation.creator = existingAnnotation.creator
      if (!annotation.created) {
        annotation.created = existingAnnotation.created
      }
      // Add type property if necessary
      if (!annotation.type) {
        annotation.type = existingAnnotation.type
      }
      // Add id property if necessary
      if (!annotation.id) {
        annotation.id = existingAnnotation.id
      }
      annotation._id = existingAnnotation._id
      return this.collection.replaceOne({ _id: existingAnnotation._id }, annotation).then(result => {
        if (result.result.n && result.result.ok) {
          return annotation
        } else {
          return null
        }
      })
    })
  }

  patchAnnotation(req) {
    let annotation = req.body
    let username = util.getUsername(req)
    if (!annotation) {
      return Promise.resolve(null)
    }
    // Add modified date.
    let date = (new Date()).toISOString()
    annotation.modified = date
    // Remove creator
    _.unset(annotation, "creator")
    // Remove type property
    _.unset(annotation, "type")
    // Adjust current annotation in database
    return this.getAnnotation(req).then(existingAnnotation => {
      if (!existingAnnotation) {
        return null
      }
      if (existingAnnotation.creator != username) {
        // TODO: Return unauthorized error.
        return null
      }
      // Use lodash merge to merge annotations
      _.merge(existingAnnotation, annotation)
      // TODO: Validate annotation after merge

      return this.collection.replaceOne({ _id: existingAnnotation._id }, existingAnnotation).then(result => result.result.ok ? existingAnnotation : null)
    })
  }

  deleteAnnotation(req) {
    let username = util.getUsername(req)
    return this.getAnnotation(req).then(existingAnnotation => {
      if (!existingAnnotation) {
        return false
      }
      if (existingAnnotation.creator != username) {
        // TODO: Return unauthorized error.
        return false
      }
      return this.collection.deleteOne({ _id: existingAnnotation._id }).then(result => {
        if (result.result.n && result.result.ok) {
          return true
        } else {
          return false
        }
      })
    })
  }

}

module.exports = AnnotationProvider
