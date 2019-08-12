const config = require("../config")
const utils = require("../utils")
const _ = require("lodash")
const validate = require("jskos-validate")

const Annotation = require("../models/annotations")
const { EntityNotFoundError, CreatorDoesNotMatchError, DatabaseAccessError, InvalidBodyError, MalformedBodyError, MalformedRequestError } = require("../errors")

module.exports = class MappingService {

  /**
   * Returns a Promise with an array of annotations.
   *
   * TODO: Add sorting.
   */
  async getAnnotations(query) {
    let criteria = []
    if (query.id) {
      criteria.push({
        $or: [
          {
            "_id": query.id,
          },
          {
            "id": query.id,
          },
        ],
      })
    }
    if (query.creator) {
      criteria.push({
        $or: [
          {
            creator: query.creator,
          },
          {
            "creator.id": query.creator,
          },
          {
            "creator.name": query.creator,
          },
        ],
      })
    }
    if (query.target) {
      criteria.push({
        target: query.target,
      })
    }
    if (query.bodyValue) {
      criteria.push({
        bodyValue: query.bodyValue,
      })
    }
    if (query.motivation) {
      criteria.push({
        motivation: query.motivation,
      })
    }

    const mongoQuery = criteria.length ? { $and: criteria } : {}
    const annotations = await Annotation.find(mongoQuery).lean().skip(query.offset).limit(query.limit).exec()
    annotations.totalCount = await Annotation.find(mongoQuery).countDocuments()
    return annotations

  }

  /**
   * Returns a promise with a single annotation with id in req.params._id.
   */
  async getAnnotation(_id) {
    if (!_id) {
      throw new MalformedRequestError()
    }
    const result = await Annotation.findById(_id).lean()
    if (!result) {
      throw new EntityNotFoundError(null, _id)
    }
    return result
  }

  /**
   * Save a new annotation in the database. Adds created date if necessary.
   */
  async postAnnotation({ body, user, baseUrl }) {
    let annotation = body
    if (!annotation || !user) {
      throw new MalformedBodyError()
    }
    // Set creator
    annotation.creator = {
      id: user.uri,
      name: user.name,
    }
    // Add created and modified dates.
    let date = (new Date()).toISOString()
    if (!annotation.created) {
      annotation.created = date
    }
    // Remove type property
    _.unset(annotation, "type")
    // Validate mapping
    if (!validate.annotation(annotation)) {
      throw new InvalidBodyError()
    }
    // Add _id and URI
    annotation._id = utils.uuid()
    annotation.id = baseUrl + "annotations/" + annotation._id
    // Make sure URI is a https URI when in production
    if (config.env === "production") {
      annotation.id = annotation.id.replace("http:", "https:")
    }

    // Save annotation
    try {
      annotation = new Annotation(annotation)
      annotation = await annotation.save()
      return annotation.toObject()
    } catch(error) {
      throw error
    }
  }

  async putAnnotation({ _id, body, user }) {
    let annotation = body
    if (!annotation) {
      throw new InvalidBodyError()
    }
    // Add modified date.
    annotation.modified = (new Date()).toISOString()
    // Remove type property
    _.unset(annotation, "type")
    // Validate mapping
    if (!validate.annotation(annotation)) {
      throw new InvalidBodyError()
    }

    const existingAnnotation = await this.getAnnotation(_id)

    if (!utils.matchesCreator(user, existingAnnotation)) {
      throw new CreatorDoesNotMatchError()
    }
    // Always preserve certain existing properties
    annotation.creator = existingAnnotation.creator
    if (!annotation.created) {
      annotation.created = existingAnnotation.created
    }
    // Override _id and id properties
    annotation.id = existingAnnotation.id
    annotation._id = existingAnnotation._id

    const result = await Annotation.replaceOne({ _id: existingAnnotation._id }, annotation)
    if (result.n && result.ok) {
      return annotation
    } else {
      throw new DatabaseAccessError()
    }
  }

  async patchAnnotation({ _id, body, user }) {
    let annotation = body
    if (!annotation) {
      throw new InvalidBodyError()
    }
    // Add modified date.
    annotation.modified = (new Date()).toISOString()
    // Remove creator
    _.unset(annotation, "creator")
    // Remove type property
    _.unset(annotation, "type")

    // Adjust current annotation in database
    const existingAnnotation = await this.getAnnotation(_id)

    if (!utils.matchesCreator(user, existingAnnotation)) {
      throw new CreatorDoesNotMatchError()
    }
    _.unset(annotation, "_id")
    _.unset(annotation, "id")
    // Use lodash merge to merge annotations
    _.merge(existingAnnotation, annotation)
    // Validate mapping
    if (!validate.annotation(annotation)) {
      throw new InvalidBodyError()
    }

    const result = await Annotation.replaceOne({ _id: existingAnnotation._id }, existingAnnotation)
    if (result.ok) {
      return existingAnnotation
    } else {
      throw new DatabaseAccessError()
    }
  }

  async deleteAnnotation({ _id, user }) {
    const existingAnnotation = await this.getAnnotation(_id)

    if (!utils.matchesCreator(user, existingAnnotation)) {
      throw new CreatorDoesNotMatchError()
    }

    const result = await Annotation.deleteOne({ _id: existingAnnotation._id })
    if (result.n && result.ok && result.deletedCount) {
      return
    } else {
      throw new DatabaseAccessError()
    }
  }

}
