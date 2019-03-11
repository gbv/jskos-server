/**
 * Simple JSON API to retrieve JSKOS Concept Mappings for mappings between RVK and GND.
 *
 * If the database doesn't exist yet, import the mappings like this:
 * mongoimport --db cocoda_api --collection mappings --file mappings.ndjson
 *
 * Import vocabularies into collection "terminologies" and their concepts into collection "concepts":
 * mongoimport --db cocoda_api --collection terminologies --file terminologies.ndjson
 * mongoimport --db cocoda_api --collection concepts --file concepts.ndjson
 *
 * Download the file from here: http://coli-conc.gbv.de/concordances/
 */

const config = require("./config")
const express = require("express")
const bodyParser = require("body-parser")
const app = express()
const mongo = require("mongodb").MongoClient
const MappingProvider = require("./lib/mapping-provider")
const TerminologyProvider = require("./lib/terminology-provider")
const StatusProvider = require("./lib/status-provider")
const AnnotationProvider = require("./lib/annotation-provider")
const _ = require("lodash")
const jskos = require("jskos-tools")
const portfinder = require("portfinder")
const { Transform } = require("stream")
const JSONStream = require("JSONStream")
const util = require("./lib/util")

// Pretty-print JSON output
app.set("json spaces", 2)

let optionalStrategies = [], auth = null

// Prepare authorization via JWT
const passport = require("passport")

if (config.auth.algorithm && config.auth.key) {
  const JwtStrategy = require("passport-jwt").Strategy,
    ExtractJwt = require("passport-jwt").ExtractJwt
  var opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.auth.key,
    algorithms: [config.auth.algorithm]
  }
  try {
    passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
      done(null, jwt_payload.user)
    }))
    // Use like this: app.get("/secureEndpoint", auth, (req, res) => { ... })
    // res.user will contain the current authorized user.
    auth = passport.authenticate("jwt", { session: false })
    optionalStrategies.push("jwt")
  } catch(error) {
    console.error("Error setting up JWT authentication")
  }
} else {
  console.warn("Note: To provide authentication via JWT, please add AUTH_ALGORITHM and AUTH_KEY to .env!")
  // Deny all requests
  auth = (req, res) => {
    res.sendStatus(403)
  }
}

// Also use anonymous strategy for endpoints that can be used authenticated or not authenticated
const AnonymousStrategy = require("passport-anonymous").Strategy
passport.use(new AnonymousStrategy())
optionalStrategies.push("anonymous")

// For endpoints with optional authentication
// For example: app.get("/optionallySecureEndpoint", config.requireAuth ? auth : authOptional, (req, res) => { ... })
// req.user will cointain the user if authorized, otherwise stays undefined.
const authOptional = passport.authenticate(optionalStrategies, { session: false })

// Promise for MongoDB db
const db = mongo.connect(config.mongoUrl, config.mongoOptions).then(client => {
  return client.db(config.mongoDb)
}).catch(error => {
  throw error
})

db.then(db => {
  config.log(`connected to MongoDB ${config.mongoUrl} (database: ${config.mongoDb})`)
  mappingProvider = new MappingProvider(db.collection("mappings"), db.collection("concordances"))
  terminologyProvider = new TerminologyProvider(db.collection("terminologies"), db.collection("concepts"))
  statusProvider = new StatusProvider(db)
  annotationProvider = new AnnotationProvider(db.collection("annotations"))
  if (config.env == "test") {
    portfinder.basePort = config.port
    return portfinder.getPortPromise()
  } else {
    return Promise.resolve(config.port)
  }
}).then(port => {
  app.listen(port, () => {
    config.log(`listening on port ${port}`)
  })
}).catch(error => {
  console.error("Error with database or express:", error)
})

// Add default headers
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,PATCH,DELETE")
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Link")
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  next()
})

// Add body-parser middleware
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// Recursively remove all fields starting with _ from response
function cleanJSON(json) {
  if (_.isArray(json)) {
    json.forEach(cleanJSON)
  } else if (_.isObject(json)) {
    _.forOwn(json, (value, key) => {
      if (key.startsWith("_")) {
        // remove from object
        _.unset(json, key)
      } else {
        cleanJSON(value)
      }
    })
  }
}

function adjustSchemes(schemes) {
  // Remove MongoDB specific fields, add JSKOS specific fields
  schemes.forEach(scheme => {
    delete scheme._id
    scheme["@context"] = "https://gbv.github.io/jskos/context.json"
    scheme.type = scheme.type || ["http://www.w3.org/2004/02/skos/core#ConceptScheme"]
  })
  return schemes
}

function adjustConcept(req) {
  return concept => {
    if (!concept) {
      return null
    }
    // Remove MongoDB specific fields, add JSKOS specific fields
    delete concept._id
    concept["@context"] = "https://gbv.github.io/jskos/context.json"
    concept.type = concept.type || ["http://www.w3.org/2004/02/skos/core#Concept"]
    return util.handleProperties({ terminologyProvider, annotationProvider }, concept, _.get(req, "query.properties"))
  }
}

function adjustConcepts(req) {
  return concepts => {
    return Promise.all(concepts.map(concept => adjustConcept(req)(concept)))
  }
}

function adjustMapping(req) {
  return mapping => {
    if (!mapping) {
      return null
    }
    // Remove MongoDB specific fields, add JSKOS specific fields
    delete mapping._id
    mapping["@context"] = "https://gbv.github.io/jskos/context.json"
    return util.handleProperties({ annotationProvider }, mapping, _.get(req, "query.properties"))
  }
}

function adjustMappings(req) {
  return mappings => {
    return Promise.all(mappings.map(mapping => adjustMapping(req)(mapping)))
  }
}

function adjustAnnotations(req) {
  return annotations => {
    return annotations.map(annotation => util.adjustAnnotation(req)(annotation))
  }
}

function handleDownload(req, res, results, filename) {
  /**
   * Transformation object to remove _id parameter from objects in a stream.
   */
  const removeIdTransform = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      cleanJSON(chunk)
      this.push(chunk)
      callback()
    }
  })
  // Default transformation: JSON
  let transform = JSONStream.stringify("[\n", ",\n", "\n]\n")
  let fileEnding = "json"
  let first = true, delimiter = ","
  switch (req.query.download) {
  case "ndjson":
    fileEnding = "ndjson"
    res.set("Content-Type", "application/x-ndjson; charset=utf-8")
    transform = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        this.push(JSON.stringify(chunk) + "\n")
        callback()
      }
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
    transform = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        // Small workaround to prepend a line to CSV
        if (first) {
          this.push(`"fromNotation"${delimiter}"toNotation"${delimiter}"type"\n`)
          first = false
        }
        let mappingToCSV = jskos.mappingToCSV({
          lineTerminator: "\r\n",
          delimiter,
        })
        this.push(mappingToCSV(chunk))
        callback()
      }
    })
    break
  }
  // Add file header
  res.set("Content-disposition", `attachment; filename=${filename}.${fileEnding}`)
  // results is a database cursor
  results.stream()
    .pipe(removeIdTransform)
    .pipe(transform)
    .pipe(res)
}

const mung = require("express-mung")
app.use(mung.json((cleanJSON)))

const path = require("path")
app.get("/", function(req, res) {
  res.setHeader("Content-Type", "text/html")
  res.sendFile(path.join(__dirname + "/index.html"))
})

app.get("/checkAuth", auth, (req, res) => {
  res.sendStatus(204)
})

app.get("/status", (req, res) => {
  statusProvider.getStatus()
    .then(result => {
      res.json(result)
    })
})

app.get("/concordances", (req, res) => {
  let supportedTypes = ["json", "ndjson"]
  if (req.query.download && !supportedTypes.includes(req.query.download)) {
    req.query.download = null
  }
  mappingProvider.getConcordances(req, res)
    .catch(err => res.send(err))
    .then(results => {
      if (req.query.download) {
        handleDownload(req, res, results, "concordances")
      } else {
        res.json(results)
      }
    })
})

app.get("/mappings", (req, res) => {
  let supportedTypes = ["json", "ndjson", "csv", "tsv"]
  if (req.query.download && !supportedTypes.includes(req.query.download)) {
    req.query.download = null
  }
  mappingProvider.getMappings(req, res)
    .catch(err => res.send(err))
    // Only adjust if it's not a download (-> stream)
    .then(req.query.download ? (result => result) : adjustMappings(req))
    .then(results => {
      if (req.query.download) {
        handleDownload(req, res, results, "mappings")
      } else {
        res.json(results)
      }
    })
})

app.post("/mappings", config.postAuthRequired ? auth : authOptional, (req, res) => {
  mappingProvider.saveMapping(req, res)
    .catch(err => res.send(err))
    .then(adjustMapping(req))
    .then(result => {
      if (result) {
        res.status(201).json(result)
      } else {
        if (!res.headersSent) {
          res.sendStatus(400)
        }
      }
    })
})

app.get("/mappings/suggest", (req, res) => {
  mappingProvider.getNotationSuggestions(req, res)
    .catch(err => res.send(err))
    .then(results => {
      res.json(results)
    })
})

app.get("/mappings/voc", (req, res) => {
  mappingProvider.getMappingSchemes(req, res)
    .catch(err => res.send(err))
    .then(adjustSchemes)
    .then(results => {
      res.json(results)
    })
})

app.get("/mappings/:_id", (req, res) => {
  mappingProvider.getMapping(req, res)
    .catch(err => res.send(err))
    .then(adjustMapping(req))
    .then(result => {
      if (result) {
        res.json(result)
      } else {
        res.sendStatus(404)
      }
    })
})

app.put("/mappings/:_id", auth, (req, res) => {
  mappingProvider.putMapping(req, res)
    .catch(err => res.send(err))
    .then(adjustMapping(req))
    .then(result => {
      if (result) {
        res.json(result)
      } else {
        if (!res.headersSent) {
          res.sendStatus(400)
        }
      }
    })
})

app.patch("/mappings/:_id", auth, (req, res) => {
  mappingProvider.patchMapping(req, res)
    .catch(err => res.send(err))
    .then(adjustMapping(req))
    .then(result => {
      if (result) {
        res.json(result)
      } else {
        if (!res.headersSent) {
          res.sendStatus(400)
        }
      }
    })
})

app.delete("/mappings/:_id", auth, (req, res) => {
  mappingProvider.deleteMapping(req, res)
    .catch(err => res.send(err))
    .then(result => {
      // `result` will be either true or false
      if (result) {
        res.sendStatus(204)
      } else {
        if (!res.headersSent) {
          res.sendStatus(400)
        }
      }
    })
})

app.get("/annotations", (req, res) => {
  annotationProvider.getAnnotations(req, res)
    .catch(err => res.send(err))
    .then(adjustAnnotations(req))
    .then(results => {
      res.json(results)
    })
})

app.post("/annotations", auth, (req, res) => {
  annotationProvider.postAnnotation(req, res)
    .catch(err => res.send(err))
    .then(util.adjustAnnotation(req))
    .then(result => {
      if (result) {
        res.status(201).json(result)
      } else {
        res.sendStatus(400)
      }
    })
})

app.get("/annotations/:_id", (req, res) => {
  annotationProvider.getAnnotation(req, res)
    .catch(err => res.send(err))
    .then(util.adjustAnnotation(req))
    .then(result => {
      if (result) {
        res.json(result)
      } else {
        res.sendStatus(404)
      }
    })
})

app.put("/annotations/:_id", auth, (req, res) => {
  annotationProvider.putAnnotation(req, res)
    .catch(err => res.send(err))
    .then(util.adjustAnnotation(req))
    .then(result => {
      if (result) {
        res.json(result)
      } else {
        if (!res.headersSent) {
          res.sendStatus(400)
        }
      }
    })
})

app.patch("/annotations/:_id", auth, (req, res) => {
  annotationProvider.patchAnnotation(req, res)
    .catch(err => res.send(err))
    .then(util.adjustAnnotation(req))
    .then(result => {
      if (result) {
        res.json(result)
      } else {
        if (!res.headersSent) {
          res.sendStatus(400)
        }
      }
    })
})

app.delete("/annotations/:_id", auth, (req, res) => {
  annotationProvider.deleteAnnotation(req, res)
    .catch(err => res.send(err))
    .then(result => {
      // `result` will be either true or false
      if (result) {
        res.sendStatus(204)
      } else {
        if (!res.headersSent) {
          res.sendStatus(400)
        }
      }
    })
})

app.get("/voc", (req, res) => {
  terminologyProvider.getVocabularies(req, res)
    .catch(err => res.send(err))
    .then(adjustSchemes)
    .then(results => {
      res.json(results)
    })
})

app.get("/data", (req, res) => {
  terminologyProvider.getDetails(req, res)
    .catch(err => res.send(err))
    .then(adjustConcepts(req))
    .then(results => {
      res.json(results)
    })
})

app.get("/voc/top", (req, res) => {
  terminologyProvider.getTop(req, res)
    .catch(err => res.send(err))
    .then(adjustConcepts(req))
    .then(results => {
      res.json(results)
    })
})

app.get("/voc/concepts", (req, res) => {
  terminologyProvider.getConcepts(req, res)
    .catch(err => res.send(err))
    .then(adjustConcepts(req))
    .then(results => {
      res.json(results)
    })
})

app.get("/narrower", (req, res) => {
  terminologyProvider.getNarrower(req, res)
    .catch(err => res.send(err))
    .then(adjustConcepts(req))
    .then(results => {
      res.json(results)
    })
})

app.get("/ancestors", (req, res) => {
  terminologyProvider.getAncestors(req, res)
    .catch(err => res.send(err))
    .then(adjustConcepts(req))
    .then(results => {
      res.json(results)
    })
})

app.get("/suggest", (req, res) => {
  terminologyProvider.getSuggestions(req, res)
    .catch(err => res.send(err))
    .then(results => {
      res.json(results)
    })
})

app.get("/search", (req, res) => {
  terminologyProvider.search(req, res)
    .catch(err => res.send(err))
    .then(adjustConcepts(req))
    .then(results => {
      res.json(results)
    })
})

module.exports = {
  db, app
}
