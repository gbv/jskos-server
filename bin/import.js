#!/usr/bin/env node

const meow = require("meow")
const cli = meow(`
Usage
  $ jskos-import [options] [type] [file]

  type is only optional if option --indexes is set, or if --reset is set and no file is given, otherwise required.
  file is unused if option --indexes is set, optional if --reset is set, otherwise required.

Options
  GNU long option         Option      Meaning
  --reset                 -r          Resets the associated collection (or all collections)
                                        before import (use with care!)
  --indexes               -i          Create indexes without import
  --quiet                 -q          Only output warnings and errors
  --format                -f          Either json or ndjson. Defaults to json or file ending if available.

Examples
  $ jskos-import --indexes
  $ jskos-import schemes schemes.ndjson
  $ jskos-import concepts concepts.ndjson
`, {
  flags: {
    reset: {
      type: "boolean",
      alias: "r",
      default: false
    },
    indexes: {
      type: "boolean",
      alias: "i",
      default: false
    },
    quiet: {
      type: "boolean",
      alias: "q",
      default: false
    },
    format: {
      type: "string",
      alias: "f",
      default: null
    },
    help: {
      type: "boolean",
      alias: "h",
      default: false
    }
  }
})
if (cli.flags.help) {
  cli.showHelp()
  process.exit(0)
}

const jskos = require("jskos-tools")
const validate = require("jskos-validate")
const config = require("../config")
const fs = require("fs")
const path = require("path")
const request = require("request")
const JSONStream = require("JSONStream")
const ndjson = require("ndjson")
const mongo = require("mongodb").MongoClient
const _ = require("lodash")
const log = (...args) => {
  if (!cli.flags.quiet) {
    console.log(...args)
  }
}
const allTypes = ["concept", "scheme", "mapping", "concordance", "annotation"]
const file = cli.input[1]

// Parse type
const type = jskos.guessObjectType(cli.input[0], true)
if (cli.input[0] && !type) {
  console.error(`Invalid <type> argument: ${cli.input[0] || ""}`)
  process.exit(1)
}

if (!cli.flags.indexes && !cli.flags.reset && !type) {
  console.error("The <type> argument is necessary to import a file.")
  process.exit(1)
}

// Check filename if necessary
if (!cli.flags.indexes && !cli.flags.reset) {
  if (!file || (!file.startsWith("http") && !fs.existsSync(file))) {
    console.error(`Invalid or missing <file>: ${file || ""}`)
    process.exit(1)
  }
}

let format
if (["json", "ndjson"].includes(cli.flags.format)) {
  format = cli.flags.format
} else {
  if (file && file.endsWith(".ndjson")) {
    format = "ndjson"
  } else {
    format = "json"
  }
  if (cli.flags.format) {
    console.warning(`Unknown format ${cli.flags.format}, using ${format} instead.`)
  }
}

log(`Start of import script: ${new Date()}`)
// Establish database connection
// The database can be accessed via connection.db
let connection
mongo.connect(config.mongo.url, config.mongo.options).then(client => {
  connection = { client, db: client.db(config.mongo.db) }
  log("Connected to database", config.mongo.db)

  if (cli.flags.reset) {
    let promises = []
    let types = type ? [type] : allTypes
    for (let type of types) {
      promises.push(collectionForType(type).drop().then(() => log(`Collection for ${type}s was dropped.`)).catch(() => log(`Collection for ${type}s could not be dropped (maybe it didn't exist yet.)`)))
    }
    return Promise.all(promises).then(() => adjustSchemes())
  } else {
    return Promise.resolve()
  }

}).then(() => {

  if (cli.flags.indexes) {
    return createIndexes(type)
  } else if (file && type) {
    return importFile(file, type, { format })
  } else {
    return null
  }

}).catch(error => {
  console.error(error)
}).then(() => {
  connection.client && connection.client.close()
  log(`End of import script: ${new Date()}`)
})

// Create Indexes function
function createIndexes(type) {
  log(`Creating indexes for ${type ? type : "all types"}.`)
  let promises = []
  let types = type ? [type] : allTypes
  for (let type of types) {
    // Map type to name of collection
    let collection = collectionForType(type)
    // Create collection if necessary and drop existing indexes
    let preparePromise = connection.db.createCollection(collectionNameForType(type)).then(() => collection.dropIndexes()).then(() => {
      console.log(`Created collection and dropped indexes for ${type}.`)
    })
    // Create new indexes
    let indexes = []
    if (type == "concept") {
      // Indexes for concepts
      indexes.push([{ "broader.uri": 1 }, {}])
      indexes.push([{ "topConceptOf.uri": 1 }, {}])
      indexes.push([{ "inScheme.uri": 1 }, {}])
      indexes.push([{ "uri": 1 }, {}])
      indexes.push([{ "notation": 1 }, {}])
      indexes.push([{ "_keywordsLabels": 1 }, {}])
      indexes.push([
        {
          "_keywordsNotation": "text",
          "_keywordsLabels": "text",
          "_keywordsOther": "text",
        },
        {
          name: "text",
          default_language: "german",
          weights: {
            "_keywordsNotation": 10,
            "_keywordsLabels": 6,
            "_keywordsOther": 3,
          }
        }
      ])
    } else if (type == "mapping") {
      // Indexes for mappings
      for (let path of ["from.memberSet", "from.memberList", "from.memberChoice", "to.memberSet", "to.memberList", "to.memberChoice", "fromScheme", "toScheme"]) {
        for (let type of ["notation", "uri"]) {
          indexes.push([{ [`${path}.${type}`]: 1 }, {}])
        }
      }
      // Separately create multi-indexes for fromScheme/toScheme
      indexes.push([{
        "fromScheme.uri": 1,
        "toScheme.uri": 1,
      }, {}])
      indexes.push([{ "uri": 1 }, {}])
      indexes.push([{ "identifier": 1 }, {}])
      indexes.push([{ "type": 1 }, {}])
      indexes.push([{ "partOf.uri": 1 }, {}])
      indexes.push([{ "creator.prefLabel.de": 1 }, {}])
      indexes.push([{ "creator.prefLabel.en": 1 }, {}])
    } else if (type == "annotation") {
      // Indexes for annotations
      indexes = [
        [{ "id": 1 }, {}],
        [{ "target": 1 }, {}],
        [{ "creator": 1 }, {}],
      ]
    } else if (type == "scheme") {
      indexes.push([{ "uri": 1 }, {}])
      indexes.push([{ "identifier": 1 }, {}])
    }
    // Create all indexes
    for(let [index, options] of indexes) {
      promises.push(preparePromise.then(() => collection.createIndex(index, options)).then(() => {
        log(`Created index on ${type}.`)
      }).catch(error => {
        console.error(error)
      }))
    }
  }
  return Promise.all(promises)
}

/**
 * Function that imports file.
 *
 * @param {*} file - filename or URL to import
 * @param {*} type - one of "scheme", "concept", "concordance", "mapping", "annotation"
 * @param {*} options - an options object with optional properties "concordance" (if mappings for a concordance are imported) and "quiet" (to suppress output)
 *
 * @returns Promise that fulfils if import succeeded.
 */
function importFile(file, type, { concordance, quiet = false, format } = {}) {
  log(`Importing ${file} as type ${type}.`)
  // Local function for logging that takes "quiet" into account
  let _log = (...params) => {
    if (!quiet) {
      log(...params)
    }
  }
  // Only for concepts, needed for post-import adjustments
  let hasChildren = {}
  // Database collection depending on type
  let collection = collectionForType(type)
  return new Promise(resolve => {
    let rs = (
      file.startsWith("http") ?
        request(file) :
        fs.createReadStream(file, { encoding: "utf8" })
    ).pipe((format == "ndjson" || file.endsWith("ndjson")) ? ndjson.parse() : JSONStream.parse("*"))
    let count = 0
    let loaded = 0
    let imported = 0
    let importedPrev = 0
    let objects = []
    let promises = []
    let printStatus = () => {
      if (loaded % 1000 == 0 || imported != importedPrev) {
        if (!quiet) {
          if (process.stdout.cursorTo) {
            process.stdout.cursorTo(0)
          } else {
            process.stdout.write("\n")
          }
          process.stdout.write(`Loaded ${loaded} ${type}s, imported ${imported} ${type}s.`)
        }
        importedPrev = imported
      }
    }
    // Function that saves current batch of objects
    let saveObjects = () => {
      if (objects.length == 0) {
        return Promise.resolve([])
      }
      let ids = objects.map(object => object._id).filter(id => id != null)
      promises.push(
        collection.bulkWrite(objects.map(object => object._id ? ({
          replaceOne: {
            filter: { _id: object._id },
            replacement: object,
            upsert: true
          }
        }) : {
          insertOne: {
            document: object
          }
        })).then(result => {
          let newIds = Object.values(result.insertedIds).concat(Object.values(result.upsertedIds))
          newIds = _.union(newIds, ids)
          imported += newIds.length
          printStatus()
          return newIds
        })
      )

      objects = []
    }
    rs.on("data", object => {
      count += 1
      // Pre-import adjustments
      // 1. Validate object and skip if validation failed.
      if (!validate[type] || !validate[type](object)) {
        console.warn(`Warning: Could not validate ${type} number ${count}.` + (object.uri ? ` (${object.uri})` : ""))
        return
      }
      // 2. Pre-import adjustments depending on type.
      switch (type) {
        case "scheme":
          // Adjustments for schemes
          object._id = object.uri
          break
        case "concept":
          // Adjustments for concepts
          object._id = object.uri
          // Add "inScheme" for all top concepts
          if (!object.inScheme && object.topConceptOf) {
            object.inScheme = object.topConceptOf
          }
          // Set hasChildren for all broader URIs
          for (let broader of object.broader || []) {
            let uri = broader && broader.uri
            if (uri) {
              hasChildren[uri] = true
            }
          }
          break
        case "mapping":
          // Adjustments for mappings
          if (object.uri) {
            // TODO: Extract ID from URI
            object._id = object.uri
          }
          // Add mapping identifier
          try {
            object.identifier = jskos.addMappingIdentifiers(object).identifier
          } catch(error) {
            _log("Could not add identifier to mapping.", error)
          }
          // Add reference to concordance.
          if (concordance && concordance.uri) {
            object.partOf = [{
              uri: concordance.uri
            }]
          }
          // Copy creator from concordance if it doesn't exist.
          if (!object.creator && concordance && concordance.creator) {
            object.creator = concordance.creator
          }
          break
        case "concordance":
          // Adjustments for concordances
          object._id = object.uri
          break
        case "annotation":
          // Adjustments for annotations
          if (object.uri) {
            // TODO: Extract ID from URI
            object._id = object.uri
          }
          break
      }
      objects.push(object)

      // Print status
      loaded += 1
      printStatus()
      // Import in bulk
      if (objects.length == 5000) {
        saveObjects()
      }
    })
    rs.on("end", () => {
      // Save remaining objects
      saveObjects()
      Promise.all(promises).then(result => {
        !quiet && process.stdout.write("\n")
        _log(`Done! Loaded ${loaded} ${type}s, imported ${imported} ${type}s.`)
        // Flatten resulting IDs
        resolve(_.flatten(result))
      }).catch(error => {
        console.error(error)
        resolve(false)
      })
    })
    rs.on("error", error => {
      !quiet && process.stdout.write("\n")
      console.error(error)
      // TODO: Should this really end the import?
      resolve(false)
    })
  }).then(ids => {
    if (!ids) {
      throw new Error("Error while reading the file.")
    }
    // Post-import adjustments
    _log("Running post-import adjustments if necessary...")
    let promises = []
    let writes = []
    let count = 0
    let adjusted = 0
    let adjustedPrev = 0
    let lastPromise = Promise.resolve()
    let printStatus = () => {
      if (count % 500 == 0 || adjusted != adjustedPrev) {
        if (!quiet) {
          if (process.stdout.cursorTo) {
            process.stdout.cursorTo(0)
          } else {
            process.stdout.write("\n")
          }
          process.stdout.write(`To be adjusted ${count} ${type}s, adjusted ${adjusted} ${type}s.`)
        }
        adjustedPrev = adjusted
      }
    }
    // Write current batch of updates
    let write = () => {
      let promise = writes.length ? collection.bulkWrite(writes).then(result => {
        adjusted += result.modifiedCount
        printStatus()
      }) : Promise.resolve()
      writes = []
      return promise
    }
    switch (type) {
      case "scheme":
        promises.push(adjustSchemes())
        break
      case "concept":
        promises.push(adjustSchemes())
        // Update properties for concept
        for (let idChunk of _.chunk(ids, 500)) {
          count += idChunk.length
          printStatus()
          lastPromise = lastPromise.then(() => collection.find({ $or: idChunk.map(_id => ({ _id })) }).toArray().then(results => {
            for (let concept of results) {
              let update = {
                narrower: hasChildren[concept._id] ? [null] : []
              }
              update._keywordsNotation = makePrefixes(concept.notation || [])
              // Do not write text index keywords for synthetic concepts
              if (!concept.type || !concept.type.includes("http://rdf-vocabulary.ddialliance.org/xkos#CombinedConcept")) {
                // Labels
                // Assemble all labels
                let labels = _.flattenDeep(Object.values(concept.prefLabel || {}).concat(Object.values(concept.altLabel || {})))
                // Split labels by space and dash
                // labels = _.flattenDeep(labels.map(label => label.split(" ")))
                // labels = _.flattenDeep(labels.map(label => label.split("-")))
                update._keywordsLabels = makeSuffixes(labels)
                // Other properties
                update._keywordsOther = []
                for (let map of (concept.creator || []).concat(concept.scopeNote, concept.editorialNote, concept.definition)) {
                  if (map) {
                    update._keywordsOther = update._keywordsOther.concat(Object.values(map))
                  }
                }
                update._keywordsOther = _.flattenDeep(update._keywordsOther)
              }
              writes.push({
                updateOne: {
                  filter: { _id: concept._id },
                  update: {
                    $set: update
                  }
                }
              })
            }
            if (writes.length >= 1000) {
              return write()
            }
            return null
          }))
          promises.push(lastPromise)
        }
        break
      case "mapping":
        // No adjustments necessary.
        break
      case "concordance":
        // For all imported concordances, import mappings from URL, and then recalculate extent.
        for (let uri of ids) {
          promises.push(connection.db.collection("mappings").remove({ "partOf.uri": uri }).then(() => {
            _log("Dropped concordance with URI", uri)
            // Retrieve concordance from database
            return collection.findOne({ _id: uri })
          }).then(concordance => {
            if (!concordance) {
              throw new Error("Concordance could not be found in database.")
            }
            let distribution = (concordance.distributions || []).find(element => element.mimetype.includes("json"))
            if (distribution) {
              // 3.2.1 Build file URL
              let url = ""
              if (distribution.download.startsWith("http")) {
                url = distribution.download
              } else {
                url = path.dirname(file) + "/" + distribution.download
              }
              return importFile(url, "mapping", { concordance, quiet: true })
            } else {
              throw new Error("No distribution found for concordance.")
            }
          }).then(() => {
            return connection.db.collection("mappings").find({ "partOf.uri": uri }).count()
          }).then(total => {
            // Update extent property and distributions.
            _log(`Recalculated extend for ${uri} to be ${total}.`)
            return collection.update({ _id: uri }, { $set:
              {
                extent: `${total}`,
                distributions: [
                  {
                    "download": `${config.baseUrl}/mappings?partOf=${uri}&download=ndjson`,
                    "format": "http://format.gbv.de/jskos",
                    "mimetype": "application/x-ndjson; charset=utf-8"
                  },
                  {
                    "download": `${config.baseUrl}/mappings?partOf=${uri}&download=csv`,
                    "mimetype": "text/csv; charset=utf-8"
                  }
                ]
              }
            })
          }).catch(error => {
            console.error("Error in post-import adjustments for concordance with URI", uri, error)
          }))
        }
        break
      case "annotation":
        // No adjustments necessary.
        break
    }
    return Promise.all(promises).then(() => write())
  }).then(() => {
    !quiet && process.stdout.write("\n")
    _log("Post-import adjustments finished.")
  })
}

function adjustSchemes() {
  // Search for concepts and topConcepts of all schemes and set property accordingly.
  let terminologyCollection = connection.db.collection("terminologies")
  let conceptCollection = connection.db.collection("concepts")
  return terminologyCollection.find({}).toArray().then(schemes => {
    let promises = []
    for (let scheme of schemes) {
      promises.push(conceptCollection.findOne({ "inScheme.uri": scheme.uri }).then(result => {
        return terminologyCollection.update({ _id: scheme.uri }, {
          [result ? "$set" : "$unset"]: {
            concepts: [null]
          }
        })
      }))
      promises.push(conceptCollection.findOne({ "topConceptOf.uri": scheme.uri }).then(result => {
        return terminologyCollection.update({ _id: scheme.uri }, {
          [result ? "$set" : "$unset"]: {
            topConcepts: [null]
          }
        })
      }))
    }
    return Promise.all(promises).then(() => console.log("Schemes adjusted."))
  })
}

// Helper functions

function collectionNameForType(type) {
  return {
    "scheme": "terminologies",
    "concept": "concepts",
    "concordance": "concordances",
    "mapping": "mappings",
    "annotation": "annotations"
  }[type]
}
function collectionForType(type) {
  return connection.db.collection(collectionNameForType(type))
}

// from https://web.archive.org/web/20170609122132/http://jam.sg/blog/efficient-partial-keyword-searches/
function makeSuffixes(values) {
  var results = []
  values.sort().reverse().forEach(function(val) {
    var tmp, hasSuffix
    for (var i=0; i<val.length-1; i++) {
      tmp = val.substr(i).toUpperCase()
      hasPrefix = results.includes(tmp)
      if (!hasSuffix) results.push(tmp)
    }
  })
  return results
}
// adapted from above
function makePrefixes(values) {
  var results = []
  values.sort().reverse().forEach(function(val) {
    var tmp, hasPrefix
    results.push(val)
    for (var i=2; i<val.length; i++) {
      tmp = val.substr(0, i).toUpperCase()
      hasPrefix = results.includes(tmp)
      if (!hasPrefix) results.push(tmp)
    }
  })
  return results
}
// Combines makeSuffixes and makePrefixes, uncomment if needed!
// function makeGrams(values) {
//   return makeSuffixes(values).concat(makePrefixes(values))
// }
