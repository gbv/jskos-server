const config = require("../config")
const fs = require("fs")
const path = require("path")
const http = require("http")
const jskos = require("jskos-tools")
const mongo = require("mongodb").MongoClient
const TerminologyProvider = require("./terminology-provider")

function connect() {
  return mongo.connect(config.mongoUrl, config.mongoOptions).then(client => {
    return { client, db: client.db(config.mongoDb) }
  }).catch(error => {
    config.log(error)
    return { client: null, db: null }
  })
}

/**
 * Returns a Promise with an array containing objects in the file.
 *
 * @param {*} file
 */
function getFileContent(file) {
  let promise = Promise.resolve(null)
  if (file.startsWith("http")) {
    // Download file first
    promise = new Promise(resolve => {
      // from: https://nodejs.org/api/http.html#http_http_get_options_callback
      http.get(file, res => {
        const { statusCode } = res

        let error
        if (statusCode !== 200) {
          error = new Error(`Request Failed. Status Code: ${statusCode}`)
        }
        if (error) {
          // consume response data to free up memory
          res.resume()
          return
        }
        res.setEncoding("utf8")
        let rawData = ""
        res.on("data", (chunk) => { rawData += chunk })
        res.on("end", () => {
          resolve(rawData)
        })
      }).on("error", () => {
        resolve(null)
      })
    })
  } else {
    promise = new Promise(resolve => {
      try {
        let data = fs.readFileSync(file, "utf8")
        resolve(data)
      } catch(error) {
        resolve(null)
      }
    })
  }
  // Read file into JSON
  return promise.then(data => {
    if (!data) {
      return Promise.reject(`Error loading file ${file}.`)
    }
    let json
    if (file.endsWith("ndjson")) {
      // Read file as newline delimited JSON
      json = []
      for(let line of data.split("\n")) {
        if (line != "") {
          json.push(JSON.parse(line))
        }
      }
    } else {
      // Read file as normal JSON
      json = JSON.parse(data)
    }
    // Convert single object to array
    if (!Array.isArray(json) && typeof json === "object") {
      json = [json]
    }
    return json
  })
}

/**
 * Imports a file with type (terminologies, concepts, concordances, mappings) into database.
 *
 * Returns a Promise with imported IDs.
 */
function importFile(type, file, options = {}) {
  let functions = {
    terminologies: importTerminologies,
    concepts: importConcepts,
    concordances: importConcordances,
    mappings: importMappings
  }
  options.file = file
  let promise = Promise.resolve(null)
  if (options.clear) {
    promise = clearCollection(type)
  }
  return promise.then(() => {
    if (functions[type]) {
      return getFileContent(file).then(result => functions[type](result, options))
    } else {
      return Promise.reject(`No import function found for type ${type}.`)
    }
  })
}

function importTerminologies(terminologies) {
  // 1. Pre-adjustments
  // Add URIs as _id
  for (let object of terminologies) {
    object._id = object.uri
  }

  let ids = []
  let client
  let db
  return connect().then(result => {
    client = result.client
    db = result.db
    let promises = []

    // 2. Write to database
    promises.push(
      db.collection("terminologies").insertMany(terminologies).then(result => {
        ids = Object.values(result.insertedIds)
      })
    )

    return Promise.all(promises)
  }).then(() => {
    return ids
  }).finally(() => {
    client.close()
  })
}

function importConcepts(concepts) {
  // 1. Pre-adjustments
  // Add URIs as _id
  for (let object of concepts) {
    object._id = object.uri
  }
  // Add "inScheme" for all top concepts
  for(let object of concepts) {
    if (!object.inScheme && object.topConceptOf) {
      object.inScheme = object.topConceptOf
    }
  }

  let ids = []
  let client
  let db
  return connect().then(result => {
    client = result.client
    db = result.db
    let terminologyProvider = new TerminologyProvider(db.collection("terminologies"), db.collection("concepts"))
    let promises = []

    // 2. Write to database
    promises.push(
      db.collection("concepts").insertMany(concepts).then(result => {
        ids = Object.values(result.insertedIds)
        let done = 0
        // 3. Post-adjustments
        let dealWithNext = function(index) {
          if (index >= ids.length) {
            return Promise.resolve()
          } else {
            let _id = ids[index]
            return db.collection("concepts").find({ _id: _id }).toArray().then(result => {
              if (result.length == 0) return
              let concept = result[0]
              let keywords = []
              // Notation, prefLabel, altLabel
              keywordsNotation = keywords.concat(concept.notation || [])
              keywordsPrefLabel = keywords.concat((concept.prefLabel && concept.prefLabel.de) ? (Array.isArray(concept.prefLabel.de) ? concept.prefLabel.de : [concept.prefLabel.de]) : [])
              keywordsAltLabel = keywords.concat((concept.altLabel && concept.altLabel.de) ? (Array.isArray(concept.altLabel.de) ? concept.altLabel.de : [concept.altLabel.de]) : [])
              return db.collection("concepts").update({ _id: _id }, { $set: { _keywordsNotation: makePrefixes(keywordsNotation), _keywordsPrefLabel: makeGrams(keywordsPrefLabel), _keywordsAltLabel: makeGrams(keywordsAltLabel),  } })
            }).then(() => {
              return terminologyProvider._getNarrower(_id)
            }).then(result => {
              // Add narrower field to object, either [] or [null]
              let narrower = result.length == 0 ? [] : [null]
              return db.collection("concepts").update({ _id: _id }, { $set: { narrower: narrower } })
            }).then(() => {
              done += 1
              if (done % 5000 == 0) {
                config.log(" -", done, "objects done.")
              }
              return dealWithNext(index + 1)
            }).catch(error => {
              config.log(error)
              return dealWithNext(index + 1)
            })
          }
        }
        let promise = dealWithNext(0)
        return promise
      })
    )

    return Promise.all(promises)
  }).then(() => {
    return ids
  }).finally(() => {
    client.close()
  })
}

function importConcordances(concordances, { reload = false, file }) {
  // 1. Pre-adjustments
  // Add URIs as _id
  for (let object of concordances) {
    object._id = object.uri
  }

  let ids = []
  let client
  let db
  return connect().then(result => {
    client = result.client
    db = result.db
    let promises = []

    // 2. Write to database
    promises.push(
      db.collection("concordances").insertMany(concordances).then(result => {
        ids = Object.values(result.insertedIds)
      })
    )

    // 3. Reload if necessary
    if (reload) {
      config.log("Reloading data for concordances...")
      for (let concordance of concordances) {
        // 3.1 Delete all existing mappings for this concordance
        promises.push(
          db.collection("mappings").remove({ "partOf.uri": concordance.uri }).then(() => {
            let distribution = (concordance.distributions || []).find(element => element.mimetype.includes("json"))
            if (distribution) {
              // 3.2.1 Build file URL
              let url = ""
              if (distribution.download.startsWith("http")) {
                url = distribution.download
              } else {
                url = path.dirname(file) + "/" + distribution.download
              }
              console.log(`Load mappings for concordance ${concordance.uri} from\n${url}...`)

              // 3.2.2 Import mappings for file
              promises.push(importFile("mappings", url, { concordance }))
            }
          })
        )
      }
    }

    return Promise.all(promises)
  }).then(() => {
    return ids
  }).finally(() => {
    client.close()
  })
}

function importMappings(mappings, { concordance }) {
  // 1. Pre-adjustments
  for (let object of mappings) {
    // Add identifiers for all mappings
    try {
      object.identifier = jskos.addMappingIdentifiers(object).identifier
    } catch(error) {
      config.log("Could not add identifier to mapping.", error)
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
  }

  let ids = []
  let client
  let db
  return connect().then(result => {
    client = result.client
    db = result.db
    let promises = []

    // 2. Write to database
    promises.push(
      db.collection("mappings").insertMany(mappings).then(result => {
        ids = Object.values(result.insertedIds)
      })
    )

    return Promise.all(promises)
  }).then(() => {
    return ids
  }).finally(() => {
    client.close()
  })
}

/**
 * Creates indexes for a certain type.
 */
function createIndexes(type) {
  let client
  let db
  return connect().then(result => {
    client = result.client
    db = result.db

    let promises = []
    let indexes = []
    if (type == "concepts") {
      indexes.push([{ "broader.uri": 1 }, {}])
      indexes.push([{ "topConceptOf.uri": 1 }, {}])
      indexes.push([{ "inScheme.uri": 1 }, {}])
      indexes.push([{ "uri": 1 }, {}])
      indexes.push([{ "notation": 1 }, {}])
      indexes.push([{ "_keywordsNotation": 1 }, {}])
      indexes.push([
        {
          "_keywordsNotation": "text",
          "_keywordsPrefLabel": "text",
          "_keywordsAltLabel": "text",
          "scopeNote.de": "text",
          "scopeNote.en": "text",
          "editorialNote.de": "text",
          "editorialNote.en": "text"
        },
        {
          name: "text",
          default_language: "german",
          weights: {
            "_keywordsNotation": 10,
            "_keywordsPrefLabel": 6,
            "_keywordsAltLabel": 4,
            "scopeNote.de": 2,
            "scopeNote.en": 1,
            "editorialNote.de": 2,
            "editorialNote.en": 1
          }
        }
      ])
    } else if (type == "mappings") {
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
      indexes.push([{ "identifier": 1 }, {}])
      indexes.push([{ "type": 1 }, {}])
      indexes.push([{ "partOf.uri": 1 }, {}])
      indexes.push([{ "creator.prefLabel.de": 1 }, {}])
    }
    for(let [index, options] of indexes) {
      promises.push(db.collection(type).createIndex(index, options).then(() => {
        config.log("Created index on", type)
      }).catch(error => {
        config.log(error)
        process.exit(1)
      }))
    }

    return Promise.all(promises)
  }).finally(() => {
    client.close()
  })
}

/**
 * Clears/drops the collection for a certain type.
 */
function clearCollection(type) {
  let client
  let db
  return connect().then(result => {
    client = result.client
    db = result.db
    return db.collection(type).drop().then(() => {
      config.log("Dropped collection", type)
    }).catch(() => {
      config.log("Could not drop collection", type)
    })
  }).finally(() => {
    client.close()
  })
}

// Helper functions

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
function makeGrams(values) {
  return makeSuffixes(values).concat(makePrefixes(values))
}

module.exports = {
  importFile,
  importTerminologies,
  importConcepts,
  importConcordances,
  importMappings,
  createIndexes,
  clearCollection,
}
