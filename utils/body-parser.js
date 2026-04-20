import _ from "lodash"
import { EntityNotFoundError, CreatorDoesNotMatchError, DatabaseInconsistencyError, InvalidBodyError } from "../errors/index.js"

import { Readable } from "node:stream"
import * as anystream from "json-anystream"
import express from "express"
import { TSVReader, toJskosMapping } from "sssom-js"

import { handleCreatorForObject } from "../routes/utils.js"
import { getCreator, getUrisOfUser } from "../utils/users.js"

/**
 * Returns `true` if the creator of `object` matches `user`, `false` if not.
 * `object.creator` can be
 * - an array of objects
 * - an object
 * - a string
 * The object for a creator will be checked for properties `uri` (e.g. JSKOS mapping) and `id` (e.g. annotations).
 *
 * If config.auth.allowCrossUserEditing is enabled, this returns true as long as a user and object are given.
 *
 * @param {object} options.req the request object (that includes req.user, req.crossUser, and req.auth)
 * @param {object} options.object any object that has the property `creator`
 * @param {boolean} options.withContributors allow contributors to be matched (for object with superordinated object)
 */
const matchesCreator = ({ req = {}, object, withContributors = false }) => {
  const { user, crossUser, auth } = req
  if (!auth) {
    return true
  }
  if (!object || !user) {
    return false
  }
  if (!object.creator && !(withContributors && object.contributor)) {
    return true
  }
  const userUris = getUrisOfUser(user)
  // TODO: crossUser could also be identityGroup. Use authenticator with expandWhitelist
  if (crossUser === true || _.intersection(crossUser || [], userUris).length) {
    return true
  }
  // Support arrays, objects, and strings as creators
  let creators = Array.isArray(object.creator) ? object.creator : (_.isObject(object.creator) ? [object.creator] : [{ uri: object.creator }])
  // Also check contributors if requested
  let contributors = withContributors ? (object.contributor || []) : []
  for (let creator of creators.concat(contributors)) {
    if (userUris.includes(creator.uri) || userUris.includes(creator.id)) {
      return true
    }
  }
  return false
}


/**
 * Custom body parser middleware.
 * - For POSTs, adds body stream via json-anystream and adjusts objects via handleCreatorForObject.
 * - For PUT/PATCH/DELETE, parses JSON body, queries the existing entity which is saved in req.existing, checks creator, and adjusts object via handleCreatorForObject.
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
export function createBodyParser(services) {
  return (req, res, next) => {

    // Assemble creator once
    const creator = getCreator(req)

    // Wrap handleCreatorForObject method
    const adjust = (object, existing) => {
      return handleCreatorForObject({
        object,
        existing,
        creator,
        req,
      })
    }

    if (req.method == "POST") {
      // Detect SSSOM/TSV Content-Type
      const contentType = req.headers["content-type"] || ""
      const isSSSOM = contentType.includes("text/tab-separated-values")
        || contentType.includes("application/sssom+tsv")

      if (isSSSOM) {
        if (req.type !== "mappings") {
          next(new InvalidBodyError("SSSOM/TSV is only supported for the mappings endpoint."))
          return
        }
        const schemeMode = req.query?.scheme
        const stream = new Readable({ objectMode: true, read() {} })
        let sssomMetadata = {}
        new TSVReader(req, { liberal: true })
          .on("metadata", meta => {
            sssomMetadata = meta
          })
          .on("mapping", m => {
            try {
              const jskosMapping = toJskosMapping(m)
              if (schemeMode === "given") {
                if (!jskosMapping.fromScheme && sssomMetadata.subject_source) {
                  jskosMapping.fromScheme = { uri: sssomMetadata.subject_source }
                }
                if (!jskosMapping.toScheme && sssomMetadata.object_source) {
                  jskosMapping.toScheme = { uri: sssomMetadata.object_source }
                }
              }
              stream.push(adjust(jskosMapping))
            } catch (err) {
              console.warn(`Warning: [sssom-js] Could not convert SSSOM mapping to JSKOS, mapping skipped. (${err.message})`)
            }
          })
          .on("error", err => stream.destroy(err))
          .on("end", () => stream.push(null))
        req.anystream = stream
        next()
      } else {
        // For POST requests, parse body with json-anystream middleware
        anystream.addStream(adjust)(req, res, next)
      }
    } else {
    // For all other requests, parse as JSON
      express.json()(req, res, async (...params) => {
      // Get existing
      // TODO: _id likely contains contain a local identifier, not a full URI!
        const uri = req.params._id || (req.body || {}).uri || req.query.uri
        let existing
        try {
          existing = await services[req.type].getItem(uri)
        } catch (error) {
        // Ignore
        }
        if (!existing) {
          next(new EntityNotFoundError(null, uri))
        } else {
        // Override certain properties with entities from database
        // Note: For POST request, this needs to be done individually in the services/{entity}.js file.
          if (["mappings", "annotations"].includes(req.type)) {
            await services.schemes.replaceSchemeProperties(req.body, ["fromScheme", "toScheme"])
            await services.schemes.replaceSchemeProperties(existing, ["fromScheme", "toScheme"])
          }
          let superordinated = {
            existing: null,
            payload: null,
          }
          // Check for superordinated object for existing (currently only `partOf`)
          if (req.type === "mappings" && existing.partOf && existing.partOf[0]) {
          // Get concordance via service
            try {
              const concordance = await services.concordances.getItem(existing.partOf[0].uri)
              superordinated.existing = concordance
            } catch (error) {
              const message = `Existing concordance with URI ${existing.partOf[0].uri} could not be found in database.`
              // console.error(message)
              next(new DatabaseInconsistencyError(message))
            }
          }
          // Check superordinated object for payload
          if (req.type === "mappings" && req.body && req.body.partOf && req.body.partOf[0]) {
          // Get concordance via service
            try {
              const concordance = await services.concordances.getItem(req.body.partOf[0].uri)
              superordinated.payload = concordance
            } catch (error) {
              next(new InvalidBodyError(`Concordance with URI ${req.body.partOf[0].uri} could not be found.`))
            }
          }
          let creatorMatches = true
          if (superordinated.existing) {
          // creator or contributor must match for existing superordinated object
            creatorMatches = creatorMatches && matchesCreator({ req, object: superordinated.existing, withContributors: true })
          } else {
          // creator needs to match for object that is updated
            creatorMatches = creatorMatches && matchesCreator({ req, object: existing })
          }
          if (superordinated.payload) {
          // creator or contributor must also match for the payload's superordinated object
            creatorMatches = creatorMatches && matchesCreator({ req, object: superordinated.payload, withContributors: true })
          }
          if (!creatorMatches) {
            next(new CreatorDoesNotMatchError())
          } else {
            req.existing = existing
            req.body = adjust(req.body, existing)
            next(...params)
          }
        }
      })
    }
  }
}
