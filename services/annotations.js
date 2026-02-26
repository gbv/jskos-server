import { uuid, isValidUuid } from "../utils/uuid.js"
import { removeNullProperties } from "../utils/utils.js"
import jskos from "jskos-tools"
import { validate } from "jskos-validate"
import _ from "lodash"
import { Annotation, Mapping, Concept } from "../models/index.js"
import { DatabaseAccessError, InvalidBodyError, ForbiddenAccessError } from "../errors/index.js"

import { AbstractService } from "./abstract.js"

export class AnnotationService extends AbstractService {

  constructor(config) {
    super(config)
    this.baseUri = config.baseUrl + "annotations/"
    this.config = config.annotations || {}
    this.model = Annotation
  }

  // Wrapper around validate.annotation that also checks the `body` field and throws errors if necessary.
  async validateAnnotation(data, options) {
    // TODO: Due to an issue with lax schemas in jskos-validate (see https://github.com/gbv/jskos-validate/issues/17), we need a workaround here.
    const result = validate.annotation(_.omit(data, "body"), options)
    if (!result || (data.body && !Array.isArray(data.body))) {
      throw new InvalidBodyError()
    }
    // Check `body` property
    if (data.body?.length) {
      const mismatchTagConcepts = await Concept.find({ "inScheme.uri": this.config.mismatchTagVocabulary?.uri })
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

  /**
   * Returns a Promise with an array of annotations.
   *
   * Can filter by:
   *
   * id, creator, target, bodyValue, motivation.
   *
   * TODO: Add sorting.
   */
  async queryItems(query) {
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
    const { limit, offset } = this._getLimitAndOffset(query)
    const annotations = await Annotation.find(mongoQuery).lean().skip(offset).limit(limit).exec()
    annotations.totalCount = await this._count(Annotation, [{ $match: mongoQuery }])

    return annotations
  }

  async prepareAndCheckItemForAction(item, action, { admin, user, bulk }) {
    if (action !== "create") {
      return item
    }
    // For type moderating, check if user is on the whitelist (except for admin=true).
    if (!admin && item.motivation == "moderating") {
      let uris = [user.uri].concat(Object.values(user.identities || {}).map(id => id.uri)).filter(uri => uri != null)
      let whitelist = this.config.moderatingIdentities
      if (whitelist && _.intersection(whitelist, uris).length == 0) {
        // Disallow
        throw new ForbiddenAccessError("Access forbidden, user is not allowed to create items of type \"moderating\".")
      }
    }
    // Add created and modified dates.
    let date = (new Date()).toISOString()
    if (!bulk || !item.created) {
      item.created = date
    }
    // Remove type property
    delete item.type
    // Validate item
    await this.validateAnnotation(item)
    // Add _id and URI
    delete item._id
    if (item.id) {
      let id = item.id
      // ID already exists, use if it's valid, otherwise remove
      if (id.startsWith(this.baseUri) && isValidUuid(id.slice(this.baseUri.length, id.length))) {
        item._id = id.slice(this.baseUri.length, id.length)
      }
    }
    if (!item._id) {
      item._id = uuid()
      item.id = this.baseUri + item._id
    }
    // Change target to object and add mapping content identifier if possible
    const target = _.get(item, "target.id", item.target)
    if (!item.target?.state?.id) {
      const mapping = await Mapping.findOne({ uri: target })
      const contentId = mapping && (mapping.identifier || []).find(id => id.startsWith("urn:jskos:mapping:content:"))
      item.target = contentId ? {
        id: target,
        state: {
          id: contentId,
        },
      } : { id: target }
    }

    return item
  }

  async updateItem({ body, existing }) {
    let annotation = body
    if (!annotation) {
      throw new InvalidBodyError()
    }
    // Add modified date.
    annotation.modified = (new Date()).toISOString()
    // Remove type property
    _.unset(annotation, "type")
    // Validate annotation
    await this.validateAnnotation(annotation)

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

  async patch({ body, existing }) {
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

    removeNullProperties(existing)

    // Validate annotation
    await this.validateAnnotation(existing)

    const result = await Annotation.replaceOne({ _id: existing._id }, existing)
    if (result.acknowledged) {
      return existing
    } else {
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
    await this._createIndexes(indexes)
  }
}
