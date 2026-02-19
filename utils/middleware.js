import config from "../config/index.js"
import _ from "lodash"
import { EntityNotFoundError, CreatorDoesNotMatchError, DatabaseInconsistencyError, InvalidBodyError } from "../errors/index.js"

import * as anystream from "json-anystream"
import express from "express"

import { createServices } from "../services/index.js"
import { createAdjuster } from "./adjust.js"

import { matchesCreator, getCreator, handleCreatorForObject } from "../routes/utils.js"

const services = createServices(config)
const adjust = createAdjuster(config, services)

const buildUrlForLinkHeader = ({ query, rel, req }) => {
  let url = config.baseUrl.substring(0, config.baseUrl.length - 1) + req.path
  if (!query && req) {
    query = req.query
  }
  let index = 0
  _.forOwn(_.omit(query, ["bulk"]), (value, key) => {
    url += `${(index == 0 ? "?" : "&")}${key}=${encodeURIComponent(value)}`
    index += 1
  })
  return `<${url}>; rel="${rel}"`
}

/**
 * Middleware that adds default headers.
 */
const addDefaultHeaders = (req, res, next) => {
  if (req.headers.origin) {
    // Allow all origins by returning the request origin in the header
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin)
  } else {
    // Fallback to * if there is no origin in header
    res.setHeader("Access-Control-Allow-Origin", "*")
  }
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,PATCH,DELETE")
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Link")
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  // Deprecation headers for /narrower, /ancestors, /search, and /suggest
  // TODO for 3.0: Remove these headers
  if (["/narrower", "/ancestors", "/search", "/suggest"].includes(req.path)) {
    res.setHeader("Deprecation", true)
    const links = []
    links.push(buildUrlForLinkHeader({ req, rel: "alternate" }))
    links[0] = links[0].replace(req.path, `/concepts${req.path}`)
    links.push("<https://github.com/gbv/jskos-server/releases/tag/v2.0.0>; rel=\"deprecation\"")
    res.set("Link", links.join(","))
  }
  next()
}

/**
 * Sets pagination headers (X-Total-Count, Link) for a response.
 * See also: https://developer.github.com/v3/#pagination
 * For Link header rels:
 * - first and last are always set
 * - prev will be set if previous page exists (i.e. if offset > 0)
 * - next will be set if next page exists (i.e. if offset + limit < total)
 *
 * Requires req.data to be set.
 */
const addPaginationHeaders = (req, res, next) => {
  const limit = req.query.limit
  const offset = req.query.offset
  const total = req.data?.totalCount ?? req.data?.length ?? null

  if (req == null || res == null || limit == null || offset == null) {
    next()
    return
  }
  // Set X-Total-Count header
  if (total === null) {
    // ! This is a workaround! We don't know the total number, so we just return an unreasonably high number here. See #176.
    res.set("X-Total-Count", 9999999)
  } else {
    res.set("X-Total-Count", total)
  }
  let links = []
  let query = _.cloneDeep(req.query)
  query.limit = limit
  // rel: first
  query.offset = 0
  links.push(buildUrlForLinkHeader({ req, query, rel: "first" }))
  // rel: prev
  if (offset > 0) {
    query.offset = Math.max(offset - limit, 0)
    links.push(buildUrlForLinkHeader({ req, query, rel: "prev" }))
  }
  // rel: next
  if (total && limit + offset < total || req.data && req.data.length === limit) {
    query.offset = offset + limit
    links.push(buildUrlForLinkHeader({ req, query, rel: "next" }))
  }
  // rel: last
  if (total !== null) {
    let current = 0
    while (current + limit < total) {
      current += limit
    }
    query.offset = current
    links.push(buildUrlForLinkHeader({ req, query, rel: "last" }))
  } else if (req.data.length < limit) {
    // Current page is last
    links.push(buildUrlForLinkHeader({ req, query, rel: "last" }))
  }
  // Push existing Link header to the back
  links.push(res.get("Link"))
  // Set Link header
  res.set("Link", links.join(","))
  next()
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
const bodyParser = (req, res, next) => {

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
    // For POST requests, parse body with json-anystream middleware
    anystream.addStream(adjust)(req, res, next)
  } else {
    // For all other requests, parse as JSON
    express.json()(req, res, async (...params) => {
      // Get existing
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
            config.error(message)
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

export {
  adjust,
  addDefaultHeaders,
  addPaginationHeaders,
  bodyParser,
}
