import _ from "lodash"
import jskos from "jskos-tools"
import { DuplicateEntityError } from "../errors/index.js"

import { Transform, Readable } from "node:stream"
import JSONStream from "JSONStream"

import { cleanJSON } from "../utils/clean-json.js"
import { getUrisOfUser } from "../utils/users.js"

/**
 * Wraps an async middleware function that returns data in the Promise.
 * The result of the Promise will be written into req.data for access by following middlewaren.
 * A rejected Promise will be caught and relayed to the Express error handling.
 *
 * adjusted from: https://thecodebarbarian.com/80-20-guide-to-express-error-handling
 */
const wrapAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).then(data => {
      // On success, save the result of the Promise in req.data.
      req.data = data
      next()
    }).catch(error => {
      // Catch and change certain errors
      if (error.code === 11000) {
        const _id = _.get(error, "keyValue._id") || _.get(error, "writeErrors[0].err.op._id")
        error = new DuplicateEntityError(null, `${_id} (${req.type})`)
      }
      // Pass error to the next error middleware.
      next(error)
    })
  }
}

// Middleware wrapper that calls the middleware depending on req.query.download
const wrapDownload = (fn, isDownload = true) => {
  return (req, res, next) => {
    if (!!req.query.download === isDownload) {
      fn(req, res, next)
    } else {
      next()
    }
  }
}

/**
 * Middleware that receives a list of supported download formats and overrides req.query.download if the requested format is not supported.
 *
 * @param {Array} formats
 */
const supportDownloadFormats = (formats) => (req, res, next) => {
  if (req.query.download && !formats.includes(req.query.download)) {
    req.query.download = null
  }
  next()
}

/**
 * Middleware that returns JSON given in req.data.
 */
const returnJSON = (req, res) => {
  // Convert Mongoose documents into plain objects
  let data
  if (Array.isArray(req.data)) {
    data = req.data.map(doc => doc?.toObject ? doc.toObject() : doc)
    // Preserve totalCount
    data.totalCount = req.data.totalCount
  } else {
    data = req.data?.toObject ? req.data?.toObject() : req.data
  }
  cleanJSON(data, 0)
  let statusCode = 200
  if (req.method == "POST") {
    statusCode = 201
  }
  res.status(statusCode).json(data)
}

/**
 * Middleware that handles download streaming.
 * Requires a database cursor in req.data.
 *
 * @param {String} filename - resulting filename without extension
 */
const handleDownload = (filename) => (req, res) => {
  let results = req.data, single = false
  // Convert to stream if necessary
  if (!(results instanceof Readable)) {
    if (!Array.isArray(results)) {
      single = true
    }
    results = new Readable({ objectMode: true })
    results.push(req.data)
    results.push(null)
  }
  /**
   * Transformation object to remove _id parameter from objects in a stream.
   */
  const removeIdTransform = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      cleanJSON(chunk)
      this.push(chunk)
      callback()
    },
  })
  // Default transformation: JSON
  let transform = JSONStream.stringify(single ? "" : "[\n\t", ",\n\t", single ? "\n" : "\n]\n")
  let fileEnding = "json"
  let first = true, delimiter = ","
  let csv
  switch (req.query.download) {
    case "ndjson":
      fileEnding = "ndjson"
      res.set("Content-Type", "application/x-ndjson; charset=utf-8")
      transform = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          this.push(JSON.stringify(chunk) + "\n")
          callback()
        },
      })
      break
    case "csv":
    case "tsv":
      fileEnding = req.query.download
      if (req.query.download == "csv") {
        delimiter = ","
        res.set("Content-Type", "text/csv; charset=utf-8")
      } else {
        delimiter = "\t"
        res.set("Content-Type", "text/tab-separated-values; charset=utf-8")
      }
      csv = jskos.mappingCSV({
        lineTerminator: "\r\n",
        creator: true,
        schemes: true,
        delimiter,
      })
      transform = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          // Small workaround to prepend a line to CSV
          if (first) {
            this.push(`"fromScheme"${delimiter}"fromNotation"${delimiter}"toScheme"${delimiter}"toNotation"${delimiter}"toNotation2"${delimiter}"toNotation3"${delimiter}"toNotation4"${delimiter}"toNotation5"${delimiter}"type"${delimiter}"creator"\n`)
            first = false
          }
          this.push(csv.fromMapping(chunk, { fromCount: 1, toCount: 5 }))
          callback()
        },
      })
      break
  }
  // Add file header
  res.set("Content-disposition", `attachment; filename=${filename}.${fileEnding}`)
  // results is a database cursor
  results
    .pipe(removeIdTransform)
    .pipe(transform)
    .pipe(res)
}

/**
 * See https://github.com/gbv/jskos-server/issues/153#issuecomment-997847433
 *
 * @param {Object} options.object JSKOS object
 * @param {Object} [options.existing] existing object from database for PUT/PATCH
 * @param {Object} [options.creator] creator object, usually extracted via `getCreator`
 * @param {Object} options.req request object (necessary for `type`, `user`, `method`, `anonymous`, and `auth`)
 */
const handleCreatorForObject = ({ object, existing, creator, req }) => {
  if (!object) {
    return object
  }

  if (req.type === "annotations") {
    // No "contributor" for annotations
    delete object.contributor
  } else if (creator) {
    // JSKOS creator has to be an array
    creator = [creator]
  }

  const userUris = getUrisOfUser(req.user)
  const anonymous = req.anonymous
  const auth = req.auth

  if (req.method === "POST") {
    if (anonymous) {
      delete object.creator
      delete object.contributor
    } else if (auth) {
      if (creator) {
        object.creator = creator
      } else {
        delete object.creator
      }
    }
  } else if (req.method === "PUT" || req.method === "PATCH") {
    if (anonymous) {
      if (req.method === "PUT") {
        object.creator = existing && existing.creator
        object.contributor = existing && existing.contributor
      } else {
        delete object.creator
        delete object.contributor
      }
    } else if (auth) {
      if (existing && existing.creator) {
        // Don't allow overriding existing creator
        if (req.method === "PUT") {
          object.creator = existing.creator
        } else {
          delete object.creator
        }
      } else if (object.creator && creator) {
        // If creator is overridden, it can only be the user
        object.creator = creator
      }
      // Update creator and/or add to contributor
      if (creator) {
        if (req.type === "annotations") {
          // Only update creator if it's the user
          if (userUris.includes((object.creator || existing && existing.creator || {}).id)) {
            object.creator = creator
          }
        } else {
          const findUserPredicate = c => jskos.compare(c, { identifier: userUris })
          const objectCreatorIndex = (object.creator || []).findIndex(findUserPredicate)
          const existingCreatorIndex = (existing && existing.creator || []).findIndex(findUserPredicate)
          const objectContributorIndex = (object.contributor || []).findIndex(findUserPredicate)
          const existingContributorIndex = (existing && existing.contributor || []).findIndex(findUserPredicate)
          if (objectCreatorIndex !== -1) {
            object.creator[objectCreatorIndex] = creator[0]
          } else if (objectContributorIndex !== -1) {
            object.contributor.splice(objectContributorIndex, 1)
            object.contributor.push(creator[0])
          } else if (existingCreatorIndex !== -1 && !object.creator) {
            object.creator = existing.creator
            object.creator[existingCreatorIndex] = creator[0]
          } else if (existingContributorIndex !== -1 && !object.contributor) {
            object.contributor = existing.contributor
            object.contributor.splice(existingContributorIndex, 1)
            object.contributor.push(creator[0])
          } else {
            object.contributor = (object.contributor || existing.contributor || []).concat(creator)
          }
        }
      }
    }
  }
  return object
}

export {
  wrapAsync,
  wrapDownload,
  supportDownloadFormats,
  returnJSON,
  handleDownload,
  handleCreatorForObject,
}
