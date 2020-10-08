const Busboy = require("busboy")
const ndjson = require("ndjson")
const { parser } = require("stream-json")

/**
 * Streamer for stream-json that streams objects or arrays.
 * - If it's an object: Only a single value (the full assembled object) will be emitted.
 * - If it's an array: Values of the array will be emitted.
 *
 * The code is basically combining StreamArray and StreamObject and adjusted to our needs.
 */
class StreamArrayOrObject extends require("stream-json/streamers/StreamBase") {

  constructor(options) {
    super(options)
    this._level = 1
  }

  _wait(chunk, _, callback) {
    if (chunk.name === "startObject") {
      this._lastKey = null
      // We're assembling the object in this._object
      this._object = {}
    } else if (chunk.name === "startArray") {
      this._counter = 0
    } else {
      return callback(new Error("Top-level object should be an array or object."))
    }
    this._transform = this._filter
    return this._transform(chunk, _, callback)
  }

  _push(discard) {
    if (this._object) {
      // Object in this._object
      if (this._lastKey === null) {
        this._lastKey = this._assembler.key
      } else {
        if (!discard) {
          // Assemble object from keys and values
          this._object[this._lastKey] = this._assembler.current[this._lastKey]
        }
        this._assembler.current = {}
        this._lastKey = null
      }
    } else {
      // Otherwise we're streaming an array
      if (this._assembler.current.length) {
        this._counter += 1
        if (discard) {
          this._assembler.current.pop()
        } else {
          // Push array values directly
          this.push(this._assembler.current.pop())
        }
      }
    }
  }

  _flush(callback) {
    // Push single object before end of stream
    this._object && this.emit("isSingleObject")
    this._object && this.push(this._object)
    callback()
  }
}

async function convertStream(stream, type) {
  switch (type) {
    case "multipart":
      // Handle multipart stream via busboy
      return await new Promise((resolve, reject) => {
        // Here we are assuming that "stream" refers to the request object
        const busboy = new Busboy({ headers: stream.headers })
        busboy.on("file", (fieldname, file, filename) => {
          // Only use fieldname `data`
          if (fieldname == "data") {
            if (filename.endsWith(".ndjson")) {
              resolve(file.pipe(ndjson.parse()))
            } else if (filename.endsWith(".json")) {
              resolve(file.pipe(parser()).pipe(new StreamArrayOrObject()))
            } else {
              file.resume()
            }
          } else {
            file.resume()
          }
        })
        busboy.on("finish", function () {
          reject("Expected json or ndjson file via field name `data`, could not be found.")
        })
        stream.pipe(busboy)
      })
    case "json":
      // Handle JSON via stream-json and custom streamer above
      return stream.pipe(parser()).pipe(new StreamArrayOrObject())
    case "ndjson":
      // Handle NDJSON via ndjson module
      return stream.pipe(ndjson.parse())
    default:
      throw new Error("convertStream: type argument has to be one of multipart, json, ndjson")
  }
}

/**
 * Middleware for POST requests to add a bodyStream property to the request object.
 * That bodyStream property will be a stream that only emits JSON objects, no matter what the input was.
 */
function addBodyStream(req, res, next) {
  // TODO: Handle URL streaming via query parameter
  let type
  if (req.is("multipart")) {
    type = "multipart"
  } else if (req.is("json")) {
    type = "json"
  } else if (req.is("application/x-ndjson")) {
    type = "ndjson"
  }
  if (!type) {
    // TODO: Proper error
    // next(new Error("No body data found"))
    req.bodyStream = null
    next()
  } else {
    convertStream(req, type).then(stream => {
      req.bodyStream = stream
      next()
    }).catch(() => {
      // TODO: Proper error handling
      req.bodyStream = null
      next()
    })
  }
}

module.exports = {
  convertStream,
  addBodyStream,
}
