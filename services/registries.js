import _ from "lodash"
import * as utils from "../utils/index.js"
import { validate } from "jskos-validate"
import { Registry } from "../models/registries.js"
import {
  EntityNotFoundError,
  DatabaseAccessError,
  InvalidBodyError,
  MalformedBodyError,
  MalformedRequestError,
} from "../errors/index.js"

export class RegistryService {
  /**
   * Retrieves registry entries.
   *
   * @param {Object} query - Query parameters controlling pagination.
   * @param {number|string} [query.limit=100] - Maximum number of registries to fetch.
   * @param {number|string} [query.offset=0] - Number of registries to skip before fetching.
   * @returns {Promise<Object[]>} A promise that resolves to the matching registries.
   */
  async getRegistries(query) {
    const limit = Number.isFinite(+query.limit)
      ? Math.max(0, +query.limit)
      : 100
    const offset = Number.isFinite(+query.offset)
      ? Math.max(0, +query.offset)
      : 0

    return Registry.find({}).skip(offset).limit(limit).lean().exec()
  }

  /**
   * Retrieves a registry entry by its identifier.
   *
   * @param {string} _id - The unique identifier of the registry to fetch.
   * @returns {Promise<Object>} Resolves with the registry data if found.
   */
  async get(_id) {
    return this.getRegistry(_id)
  }

  /**
   * Retrieves a registry entry by its identifier.
   *
   * @async
   * @function getRegistry
   * @param {string} _id - The unique identifier of the registry to fetch.
   * @returns {Promise<Object>} Resolves with the registry data if found.
   * @throws {MalformedRequestError} If no identifier is provided.
   * @throws {EntityNotFoundError} If no registry exists for the given identifier.
   */
  async getRegistry(uriOrId) {
    if (!uriOrId) {
      throw new MalformedRequestError()
    }
    let result

    // First look via ID
    result = await Registry.findById(uriOrId).lean()
    if (result) {
      return result
    }

    // Then via URI
    result = await Registry.findOne({ uri: uriOrId }).lean()
    if (result) {
      return result
    }

    // No registry found
    throw new EntityNotFoundError(`Registry not found: ${uriOrId}`)
  }

  /**
   * Returns OpenSearch Suggest format for registries.
   *
   * @param {Object} query - Query parameters.
   * @returns {Promise<Array>} OpenSearch Suggest array.
   */
  async getSuggestions(query) {
    const results = await this.searchRegistry(query)
    return utils.searchHelper.toOpenSearchSuggestFormat({ query, results })
  }

  /**
   * Searches registry entries based on query params.
   *
   * Note: Search uses utils.searchHelper which typically builds a $text query.
   *
   * @param {Object} query - Query parameters.
   * @returns {Promise<Object[]>} Matching registries.
   */
  async searchRegistry(query) {
    const search = query?.search || query?.q || ""
    const voc = query?.voc

    return utils.searchHelper.searchItem({
      search,
      voc,
      queryFunction: (mongoQuery) => Registry.find(mongoQuery).lean().exec(),
    })
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
  async prepareAndCheckRegistryForAction(registry, action) {
    if (!_.isObject(registry)) {
      throw new MalformedBodyError()
    }
    if (["create", "update"].includes(action)) {
      // Validate registry
      const ok = validate.registry
        ? validate.registry(registry)
        : validate(registry)
      if (!ok || !registry.uri) {
        const msgs =
          validate.registry?.errorMessages || validate.errorMessages || []
        throw new InvalidBodyError(
          msgs.join("; ") || "Registry validation failed",
        )
      }
      // Add _id
      registry._id = registry.uri

      // Add index keywords
      utils.searchHelper.addKeywords(registry)

      // Remove created for update action
      if (action === "update") {
        delete registry.created
      }
    }
    return registry
  }

  /**
   * Handles insertion of registry items.
   *
   * @param {Object} options - Options for the registry import.
   * @param {NodeJS.ReadableStream} options.bodyStream - Stream emitting registry items.
   * @param {boolean} [options.bulk=true] - Whether to perform a bulk write operation.
   * @param {boolean} [options.bulkReplace=true] - For bulk operations, whether to replace existing documents.
   * @returns {Promise<Object[]|Object|undefined>} Imported registries or a single registry when a single object is sent; undefined when no valid single item exists.
   * @throws {MalformedBodyError} When the body stream is missing.
   * @throws {InvalidBodyError} When validation fails in non-bulk mode.
   */
  async postRegistries({ bodyStream, bulk = true, bulkReplace = true }) {
    if (!bodyStream) {
      throw new MalformedBodyError()
    }

    let isMultiple = true

    // As a workaround, build body from bodyStream
    // TODO: Use actual stream
    let registries = await new Promise((resolve) => {
      const body = []
      bodyStream.on("data", registry => {
        body.push(registry)
      })
      bodyStream.on("isSingleObject", () => {
        isMultiple = false
      })
      bodyStream.on("end", () => {
        resolve(body)
      })
    })

    let response

    // Prepare
    registries = await Promise.all(registries.map(registry => {
      return this.prepareAndCheckRegistryForAction(registry, "create")
        .catch(error => {
          // Ignore errors for bulk
          if (bulk) {
            return null
          }
          throw error
        })
    }))
    // Filter out null
    registries = registries.filter(s => s)

    if (bulk) {
      // Use bulkWrite for most efficiency
      registries.length && await Registry.bulkWrite(utils.bulkOperationForEntities({ entities: registries, replace: bulkReplace }))
      response = registries.map(s => ({ uri: s.uri }))
    } else {
      response = await Registry.insertMany(registries, { lean: true })
    }

    return isMultiple ? response : response[0]
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
  async putRegistry({ body, existing }) {
    if (!body) {
      throw new InvalidBodyError()

    }

    // Add modified date.
    body.modified = new Date().toISOString()


    // Remove type property
    _.unset(body, "type")

    // Validate registry
    const ok = validate.registry ? validate.registry(body) : validate(body)
    if (!ok) {
      const msgs =
        validate.registry?.errorMessages || validate.errorMessages || []
      throw new InvalidBodyError(
        msgs.join("; ") || "Registry validation failed",
      )
    }

    // Preserve existing property: created date
    body.created = existing.created

    // Override _id and id properties
    body.id = existing.id
    body._id = existing._id

    // Replace in database
    const result = await Registry.replaceOne({ _id: existing._id }, body)
    if (!result.matchedCount) {
      throw new EntityNotFoundError(`Registry not found: ${existing._id}`)
    }

    // Confirm that the update was acknowledged
    if (!result.acknowledged) {
      throw new DatabaseAccessError()
    }

    // Return the updated registry entry
    const doc = await Registry.findById(existing._id).lean()
    if (!doc) {
      throw new DatabaseAccessError()
    }

    return doc
  }

  /**
   * Partially updates a registry entry.
   *
   * @async
   * @function patchRegistry
   * @param {Object} params - Parameters for updating a registry.
   * @param {Object} params.body - Incoming registry fields to merge into the existing entry.
   * @param {Object} params.existing - The existing registry document from the database to be updated.
   * @throws {InvalidBodyError} If the request body is missing or fails validation.
   * @throws {EntityNotFoundError} If the target registry does not exist.
   * @throws {DatabaseAccessError} If the database update fails.
   * @returns {Promise<Object>} The updated registry document from the database.
   */
  async patchRegistry({ body, existing }) {
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

    utils.removeNullProperties(existing)

    // Validate merged object
    const ok = validate.registry
      ? validate.registry(existing)
      : validate(existing)
    if (!ok) {
      const msgs =
        validate.registry?.errorMessages || validate.errorMessages || []
      throw new InvalidBodyError(
        msgs.join("; ") || "Registry validation failed",
      )
    }

    // Replace in database
    const result = await Registry.replaceOne({ _id: existing._id }, existing)
    if (!result.matchedCount) {
      throw new EntityNotFoundError(`Registry not found: ${existing._id}`)
    }

    // Confirm that the update was acknowledged
    if (!result.acknowledged) {
      throw new DatabaseAccessError()
    }

    // Return the updated registry entry
    const doc = await Registry.findById(existing._id).lean()
    if (!doc) {
      throw new DatabaseAccessError()
    }

    return doc
  }

  /**
   * Deletes a registry entry.
   *
   * @async
   * @function deleteRegistry
   * @param {Object} params - Parameters containing the registry to delete.
   * @param {Object} params.existing - The existing registry document to be deleted.
   * @throws {DatabaseAccessError} If no registry document was deleted.
   * @returns {Promise<void>} Resolves when the registry has been successfully deleted.
   */
  async deleteRegistry({ existing }) {
    const result = await Registry.deleteOne({ _id: existing._id })
    if (!result.deletedCount) {
      throw new DatabaseAccessError()
    }
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
    indexes.push([{ "API.url": 1 }, {}])
    indexes.push([{ "API.type": 1 }, {}])

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
        default_language: "german",
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
      await Registry.createCollection()
    } catch (error) {
      console.error("Error creating collection:", error)
      // Ignore error
    }

    // Drop existing indexes
    await Registry.collection.dropIndexes()
    for (const [index, options] of indexes) {
      await Registry.collection.createIndex(index, options)
    }
  }
}