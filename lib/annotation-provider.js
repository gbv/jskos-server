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
        $or: [
          {
            creator: query.creator
          },
          {
            "creator.id": query.creator
          },
          {
            "creator.name": query.creator
          },
        ]
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
    if (!annotation || !req.user) {
      return Promise.resolve(null)
    }
    // Set creator
    if (!annotation.creator) {
      annotation.creator = {
        id: req.user.uri,
        name: req.user.name
      }
    }
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

  putAnnotation(req, res) {
    let annotation = req.body
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
      if (!util.matchesCreator(req.user, existingAnnotation)) {
        res.sendStatus(403)
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
      // Override _id and id properties
      annotation.id = existingAnnotation.id
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

  patchAnnotation(req, res) {
    let annotation = req.body
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
      if (!util.matchesCreator(req.user, existingAnnotation)) {
        res.sendStatus(403)
        return null
      }
      _.unset(annotation, "_id")
      _.unset(annotation, "id")
      // Use lodash merge to merge annotations
      _.merge(existingAnnotation, annotation)
      // TODO: Validate annotation after merge

      return this.collection.replaceOne({ _id: existingAnnotation._id }, existingAnnotation).then(result => result.result.ok ? existingAnnotation : null)
    })
  }

  deleteAnnotation(req, res) {
    return this.getAnnotation(req).then(existingAnnotation => {
      if (!existingAnnotation) {
        return false
      }
      if (!util.matchesCreator(req.user, existingAnnotation)) {
        res.sendStatus(403)
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
