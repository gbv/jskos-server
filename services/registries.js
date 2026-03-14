import _ from "lodash"
import { validate } from "jskos-validate"
import { addKeywords } from "../utils/searchHelper.js"
import { EntityNotFoundError, DatabaseAccessError, InvalidBodyError, MalformedBodyError } from "../errors/index.js"

import { AbstractService } from "./abstract.js"

export class RegistryService extends AbstractService {
  static allMemberTypes = ["schemes", "concepts", "mappings", "concordances", "annotations", "registries"]

  constructor(config) {
    super(config)
    this.model = this.models.registry

    this.config = config.registries || {}
    this.types = {}

    // TODO: duplicated code in config.setup
    for (let type of RegistryService.allMemberTypes) {
      this.types[type] = config.types?.[type]
      if (this.types[type] === true) {
        this.types[type] = { mustExist: false, skipInvalid: false }
      }
      if (this.types[type] && !("uriRequired" in this.types[type])) {
        this.types[type].uriRequired = true
      }
    }
  }

  /**
   * Retrieves registry entries.
   *
   * @param {Object} query - Query parameters controlling pagination.
   * @param {number|string} [query.limit=100] - Maximum number of registries to fetch.
   * @param {number|string} [query.offset=0] - Number of registries to skip before fetching.
   * @returns {Promise<Object[]>} A promise that resolves to the matching registries.
   */
  async queryItems(query) {
    const { limit, offset } = this._getLimitAndOffset(query)
    return this.model.find({}).skip(offset).limit(limit).lean().exec()
  }

  /**
   * Prepares and checks a registry before inserting/updating:
   * - validates object, throws error if it doesn't (create/update)
   * - add `_id` property (create/update)
   * - add search keyword fields for text index (create/update)
   *
   * @param {Object} registry registry object
   * @param {string} action one of "create" or "update"
   * @returns {Object} prepared registry
   */
  async prepareAndCheckItemForAction(registry, action) {
    if (typeof registry !== "object") {
      throw new MalformedBodyError("Invalid registry object")
    }

    if (["create", "update"].includes(action)) {
      // Validate registry
      if (!validate.registry(registry)) {
        // TODO: use error object
        const msgs = validate.registry.errorMessages || ["Registry validation failed"]
        throw new InvalidBodyError(msgs.join("; "))
      }
      if (!registry.uri) {
        // TODO: how about minting URIs?
        throw new InvalidBodyError("Registry lacks uri")
      }

      await this.processMembers(registry)

      // Add _id
      registry._id = registry.uri

      // Add index keywords
      addKeywords(registry)

      // Remove created for update action // TODO: why?
      if (action === "update") {
        delete registry.created
      }
    }
    return registry
  }


  /**
   * Updates an existing registry entry, while preserving immutable fields.
   *
   * @param {Object} params - Parameters for updating the registry.
   * @param {Object} params.body - The new registry data to store.
   * @param {Object} params.existing - The existing registry document from the database.
   * @returns {Promise<Object>} The updated registry document.
   * @throws {InvalidBodyError} If the request body is missing or fails validation.
   * @throws {EntityNotFoundError} If the targeted registry is not found.
   * @throws {DatabaseAccessError} If the database operation fails.
   */
  async updateItem({ body, existing }) {
    if (!body) {
      throw new InvalidBodyError()
    }

    body.modified = new Date().toISOString()

    delete body.type

    // Validate registry
    if (!validate.registry(body)) {
      const msgs = validate.registry?.errorMessages || []
      throw new InvalidBodyError(
        msgs.join("; ") || "Registry validation failed",
      )
    }

    await this.processMembers(body)

    // Preserve existing property: created date
    body.created = existing.created

    // Override _id and id properties
    body.id = existing.id
    body._id = existing._id

    // Replace in database
    const result = await this.model.replaceOne({ _id: existing._id }, body)
    if (!result.matchedCount) {
      throw new EntityNotFoundError(`Registry not found: ${existing._id}`)
    }

    // Confirm that the update was acknowledged
    if (!result.acknowledged) {
      throw new DatabaseAccessError()
    }

    // Return the updated registry entry
    const doc = await this.model.findById(existing._id).lean()
    if (!doc) {
      throw new DatabaseAccessError()
    }

    return doc
  }

  async patch({ body, existing }) {
    if (!body) {
      throw new InvalidBodyError()
    }
    if (!existing?._id) {
      throw new EntityNotFoundError("Registry not found")
    }

    existing.modified = new Date().toISOString()

    // Protect identity + server-managed fields
    for (let key of ["_id", "id", "uri", "created"]) {
      delete body[key]
    }

    // Merge existing with updates
    _.assign(existing, body)

    this._removeNullProperties(existing)

    await this.processMembers(existing)

    // Validate merged object
    if (!validate.registry(existing)) {
      const msgs = validate.registry.errorMessages || []
      throw new InvalidBodyError(
        msgs.join("; ") || "Registry validation failed",
      )
    }

    // Replace in database
    const result = await this.model.replaceOne({ _id: existing._id }, existing)
    if (!result.matchedCount) {
      throw new EntityNotFoundError(`Registry not found: ${existing._id}`)
    }

    // Confirm that the update was acknowledged
    if (!result.acknowledged) {
      throw new DatabaseAccessError()
    }

    // Return the updated registry entry
    const doc = await this.model.findById(existing._id).lean()
    if (!doc) {
      throw new DatabaseAccessError()
    }

    return doc
  }

  /**
   * Initializes the Registry collection by creating it if absent, removing any existing indexes,
   * and establishing the full set of required indexes
   */
  async createIndexes() {
    const indexes = []
    indexes.push([{ uri: 1 }, {}])
    indexes.push([{ identifier: 1 }, {}])
    indexes.push([{ notation: 1 }, {}])
    indexes.push([{ type: 1 }, {}])

    indexes.push([{ created: 1 }, {}])
    indexes.push([{ modified: 1 }, {}])
    indexes.push([{ startDate: 1 }, {}])
    indexes.push([{ endDate: 1 }, {}])

    indexes.push([{ url: 1 }, {}])
    indexes.push([{ "subject.uri": 1 }, {}])

    // TODO: check this
    indexes.push([{ _keywordsLabels: 1 }, {}])
    indexes.push([{ _keywordsPublisher: 1 }, {}])
    indexes.push([{ "_keywordsLabels.0": 1 }, {}])
    indexes.push([
      {
        _keywordsNotation: "text",
        _keywordsLabels: "text",
        _keywordsOther: "text",
        _keywordsPublisher: "text",
      },
      {
        name: "text",
        default_language: "german", // ??
        weights: {
          _keywordsNotation: 10,
          _keywordsLabels: 6,
          _keywordsOther: 3,
          _keywordsPublisher: 3,
        },
      },
    ])

    // Create collection if necessary
    try {
      await this.model.createCollection()
    } catch (error) {
      this.error("Error creating collection:", error)
      // Ignore error
    }

    // Drop existing indexes
    await this.model.collection.dropIndexes()
    for (const [index, options] of indexes) {
      await this.model.collection.createIndex(index, options)
    }
  }

  /**
   * Validates and filters registry member fields based on config.
   *
   * @param {Object} registry registry object
   * @throws {InvalidBodyError} When a disallowed membership field is present.
   */
  async processMembers(registry) {
    const usedTypes = RegistryService.allMemberTypes.filter(type => registry[type])

    if (!this.config.mixedTypes) {
      if (usedTypes.length > 1) {
        throw new InvalidBodyError(`Registry must not have multiple member types, found: ${usedTypes.join(", ")}`)
      }
    }

    for (let type of usedTypes) {
      if (!this.config.types[type]) {
        throw new InvalidBodyError(`Registry member type not allowed: ${type}`)
      }

      const { uriRequired, mustExist, skipInvalid } = this.config.types[type]

      const validator = validate[type.replace(/ies$/,"y").replace(/s$/,"")]

      let items = []
      for (let item of registry[type].filter(item => item !== null)) {
        let error
        if (uriRequired && !item.uri) {
          error = `missing ${type} uri in registry`
        } else if (!validator(item)) {
          error = `invalid ${type} in registry`
          // TODO: use validator.errors error object
        } else if (mustExist) {
          const found = await this.models[type].findOne({ uri: item.uri }).lean()
          if (!found) {
            error = `${type} not found with uri: ${item.uri}`
          }
        }
        if (error) {
          if (!skipInvalid) {
            throw new InvalidBodyError(error)
          }
        } else {
          items.push(item)
        }
      }
      registry[type] = items
    }

  }
}
