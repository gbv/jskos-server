import _ from "lodash"
import config from "../config/index.js"
import * as utils from "../utils/index.js"
import jskos from "jskos-tools"
import { validate } from "jskos-validate"

import { Annotation, Mapping, Concept } from "../models/index.js"
import { EntityNotFoundError, DatabaseAccessError, InvalidBodyError, MalformedBodyError, MalformedRequestError, ForbiddenAccessError } from "../errors/index.js"

// Wrapper around validate.annotation that also checks the `body` field and throws errors if necessary.
const validateAnnotation = async (data, options) => {
  // TODO: Due to an issue with lax schemas in jskos-validate (see https://github.com/gbv/jskos-validate/issues/17), we need a workaround here.
  const result = validate.annotation(_.omit(data, "body"), options)
  if (!result || (data.body && !_.isArray(data.body))) {
    throw new InvalidBodyError()
  }
  // Check `body` property
  if (data.body?.length) {
    const mismatchTagConcepts = await Concept.find({ "inScheme.uri": config.annotations?.mismatchTagVocabulary?.uri })
    if (data.bodyValue !== "-1") {
      throw new InvalidBodyError("Property `body` is currently only allowed with when `bodyValue` is set to \"-1\".")
    }
    for (const tag of data.body) {
      if (tag.type !== "SpecificResource") {
        throw new InvalidBodyError("Currently, the only allowed `type` of body values in annotations is \"SpecificResource\".")
      }
      if (tag.purpose !== "tagging") {
        throw new InvalidBodyError("Currently, the only allowed `purpose` of body values in annotations is \"tagging\".")
      }
      if (!mismatchTagConcepts.find(concept => jskos.compare(concept, { uri: tag.value }))) {
        throw new InvalidBodyError(`Either \`annotations.mismatchTagVocabulary\` is not configured or tag mismatch URI "${tag.value}" is not a valid tag.`)
      }
    }
  }
  return true
}

export class AnnotationService {

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
            _id: query.id,
          },
          {
            id: query.id,
          },
        ],
      })
    }
    if (query.creator) {
      const creators = query.creator.split("|")
      criteria.push({
        $or: _.flatten(creators.map(creator => [
          jskos.isValidUri(creator) ? null : { "creator.name": new RegExp(_.escapeRegExp(creator), "i") },
          jskos.isValidUri(creator) ? { "creator.id": creator } : null,
          { creator },
        ].filter(Boolean))),
      })
    }
    if (query.target) {
      criteria.push({
        $or: [
          { target: query.target },
          { "target.id": query.target },
        ],
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
    annotations.totalCount = await utils.count(Annotation, [{ $match: mongoQuery }])
    return annotations

  }

  async get(_id) {
    return this.getAnnotation(_id)
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
   * Save a new annotation or multiple annotations in the database. Adds created date if necessary.
   */
  async postAnnotation({ bodyStream, user, bulk = false, bulkReplace = true, admin = false }) {
    if (!bodyStream) {
      throw new MalformedBodyError()
    }

    let isMultiple = true

    // As a workaround, build body from bodyStream
    // TODO: Use actual stream
    let annotations = await new Promise((resolve) => {
      const body = []
      bodyStream.on("data", annotation => {
        body.push(annotation)
      })
      bodyStream.on("isSingleObject", () => {
        isMultiple = false
      })
      bodyStream.on("end", () => {
        resolve(body)
      })
    })

    let response

    // Adjust all annotations
    annotations = await Promise.all(annotations.map(async annotation => {
      try {
        // For type moderating, check if user is on the whitelist (except for admin=true).
        if (!admin && annotation.motivation == "moderating") {
          let uris = [user.uri].concat(Object.values(user.identities || {}).map(id => id.uri)).filter(uri => uri != null)
          let whitelist = config.annotations.moderatingIdentities
          if (whitelist && _.intersection(whitelist, uris).length == 0) {
            // Disallow
            throw new ForbiddenAccessError("Access forbidden, user is not allowed to create annotations of type \"moderating\".")
          }
        }
        // Add created and modified dates.
        let date = (new Date()).toISOString()
        if (!bulk || !annotation.created) {
          annotation.created = date
        }
        // Remove type property
        _.unset(annotation, "type")
        // Validate annotation
        await validateAnnotation(annotation)
        // Add _id and URI
        delete annotation._id
        let uriBase = config.baseUrl + "annotations/"
        if (annotation.id) {
          let id = annotation.id
          // ID already exists, use if it's valid, otherwise remove
          if (id.startsWith(uriBase) && utils.isValidUuid(id.slice(uriBase.length, id.length))) {
            annotation._id = id.slice(uriBase.length, id.length)
          }
        }
        if (!annotation._id) {
          annotation._id = utils.uuid()
          annotation.id = config.baseUrl + "annotations/" + annotation._id
        }
        // Make sure URI is a https URI when in production
        if (config.env === "production") {
          annotation.id = annotation.id.replace("http:", "https:")
        }
        // Change target to object and add mapping content identifier if possible
        const target = _.get(annotation, "target.id", annotation.target)
        if (!_.get(annotation, "target.state.id")) {
          const mapping = await Mapping.findOne({ uri: target })
          const contentId = mapping && (mapping.identifier || []).find(id => id.startsWith("urn:jskos:mapping:content:"))
          annotation.target = contentId ? {
            id: target,
            state: {
              id: contentId,
            },
          } : { id: target }
        }

        return annotation
      } catch(error) {
        if (bulk) {
          return null
        }
        throw error
      }
    }))
    annotations = annotations.filter(a => a)

    if (bulk) {
      // Use bulkWrite for most efficiency
      annotations.length && await Annotation.bulkWrite(utils.bulkOperationForEntities({ entities: annotations, replace: bulkReplace }))
      response = annotations.map(a => ({ id: a.id }))
    } else {
      response = await Annotation.insertMany(annotations, { lean: true })
    }

    return isMultiple ? response : response[0]
  }

  async putAnnotation({ body, existing }) {
    let annotation = body
    if (!annotation) {
      throw new InvalidBodyError()
    }
    // Add modified date.
    annotation.modified = (new Date()).toISOString()
    // Remove type property
    _.unset(annotation, "type")
    // Validate annotation
    await validateAnnotation(annotation)

    // Always preserve certain existing properties
    annotation.created = existing.created

    // Override _id and id properties
    annotation.id = existing.id
    annotation._id = existing._id

    // Change target property to object if necessary
    if (_.isString(annotation.target)) {
      annotation.target = { id: annotation.target }
    }

    const result = await Annotation.replaceOne({ _id: existing._id }, annotation)
    if (result.acknowledged && result.matchedCount) {
      return annotation
    } else {
      throw new DatabaseAccessError()
    }
  }

  async patchAnnotation({ body, existing }) {
    let annotation = body
    if (!annotation) {
      throw new InvalidBodyError()
    }

    annotation.modified = (new Date()).toISOString()

    for (let key of ["_id", "id", "type", "created"]) {
      delete annotation[key]
    }

    _.assign(existing, annotation)

    // Change target property to object if necessary
    if (_.isString(annotation.target)) {
      annotation.target = { id: annotation.target }
    }

    utils.removeNullProperties(existing)

    // Validate annotation
    await validateAnnotation(existing)

    const result = await Annotation.replaceOne({ _id: existing._id }, existing)
    if (result.acknowledged) {
      return existing
    } else {
      throw new DatabaseAccessError()
    }
  }

  async deleteAnnotation({ existing }) {
    const result = await Annotation.deleteOne({ _id: existing._id })
    if (!result.deletedCount) {
      throw new DatabaseAccessError()
    }
  }

  async createIndexes() {
    const indexes = [
      [{ id: 1 }, {}],
      [{ identifier: 1 }, {}],
      [{ target: 1 }, {}],
      [{ "target.id": 1 }, {}],
      [{ creator: 1 }, {}],
      [{ "creator.id": 1 }, {}],
      [{ "creator.name": 1 }, {}],
      [{ motivation: 1 }, {}],
      [{ bodyValue: 1 }, {}],
    ]
    // Create collection if necessary
    try {
      await Annotation.createCollection()
    } catch (error) {
      // Ignore error
    }
    // Drop existing indexes
    await Annotation.collection.dropIndexes()
    for (let [index, options] of indexes) {
      await Annotation.collection.createIndex(index, options)
    }
  }

}

export const annotationService = new AnnotationService()
