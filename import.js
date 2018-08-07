#!/usr/bin/env node

/**
 * Import script for mappings, terminologies, and concepts.
 * For help, see:
 * $ npm run import -- -h
 */

const meow = require("meow")
var fs = require("fs")

// Read command line arguments
const cli = meow(`
Usage
  $ npm run import -- [OPTIONS]
  Note the obligatory -- after import.

Options
  GNU long option         Option      Meaning
  --concepts      <file>  -c <file>   Import file as concepts
  --terminologies <file>  -t <file>   Import file as terminologies
  --mappings      <file>  -m <file>   Import file as mappings
  --remove                -r          Remove all records before importing
  --indexes               -i          Create indexes (for all object types that are being imported)

Examples
  $ npm run import -- -r -i -t terminologies.ndjson -c ddc.ndjson -c rvk.ndjson
`, {
  flags: {
    concepts: {
      type: "string",
      alias: "c"
    },
    terminologies: {
      type: "string",
      alias: "t"
    },
    mappings: {
      type: "string",
      alias: "m"
    },
    remove: {
      type: "boolean",
      alias: "r",
      default: false
    },
    indexes: {
      type: "boolean",
      alias: "i",
      default: false
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
// Check if at least one of the arguments are given
if (!cli.flags.concepts && !cli.flags.terminologies && !cli.flags.mappings && !cli.flags.indexes && !cli.flags.remove) {
  cli.showHelp()
  process.exit(1)
}
// Check if all given arguments are actual files
let files = { concepts: [], terminologies: [], mappings: [] }
let typesToDelete = []
for (let type of Object.keys(files)) {
  if (cli.flags[type]) {
    files[type] = Array.isArray(cli.flags[type]) ? cli.flags[type] : [cli.flags[type]]
  } else {
    if (cli.flags[type] != "") {
      typesToDelete.push(type)
    }
  }
}

let isError = false
for (let file of [].concat(files.concepts, files.terminologies, files.mappings)) {
  if (!fs.existsSync(file)) {
    isError = true
    config.log("Error: File", file, "does not exist.")
  }
}
if (isError) {
  process.exit(1)
}
// Delete unused keys from files if at least one stays
if (typesToDelete.length < Object.keys(files).length) {
  for(let type of typesToDelete) {
    delete files[type]
  }
}

const mongo = require("mongodb").MongoClient
const config = require("./config")
const TerminologyProvider = require("./lib/terminology-provider")

mongo.connect(config.mongoUrl, config.mongoOptions, (err, client) => {
  if (err) {
    config.log(err)
    process.exit(1)
  }

  let db = client.db(config.mongoDb)
  config.log("Connected to database", config.mongoDb)
  let terminologyProvider = new TerminologyProvider(db.collection("terminologies"), db.collection("concepts"))

  // Remove if necessary
  let promises = []
  if (cli.flags.remove) {
    for(let type of Object.keys(files)) {
      promises.push(db.collection(type).drop().then(() => { config.log("Dropped collection", type) }))
    }
  }

  Promise.all(promises)
    .catch(error => {
      config.log("Error:", error)
      client.close()
    })
    .then(() => {
      if (!cli.flags.indexes) {
        return
      }
      config.log("Dropping indexes...")
      let promises = []
      // Drop all indexes
      for(let type of Object.keys(files)) {
        promises.push(db.collection(type).dropIndexes().catch(() => null))
      }
      return Promise.all(promises)
    })
    .then(() => {
      if (!cli.flags.indexes) {
        return
      }
      config.log("Creating indexes...")
      let promises = []
      // Create indexes
      for(let type of Object.keys(files)) {
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
        }
        for(let [index, options] of indexes) {
          promises.push(db.collection(type).createIndex(index, options).then(() => { config.log("Created index on", type) }).catch(error => { config.log(error); process.exit(1) }))
        }
      }
      return Promise.all(promises)
    })
    .then(() => {
      let promises = []
      for (let type of Object.keys(files)) {
        for (let file of files[type]) {
          config.log("Reading", file)
          let data = fs.readFileSync(file, "utf8")
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
          // Add URIs as _id for all concepts and terminologies
          if (type == "concepts" || type == "terminologies") {
            for(let object of json) {
              object._id = object.uri
            }
          }
          // Add "inScheme" for all top concepts
          if (type == "concepts") {
            for(let object of json) {
              if (!object.inScheme && object.topConceptOf) {
                object.inScheme = object.topConceptOf
              }
            }
          }
          let lastId = null
          promises.push(
            db.collection(type).insertMany(json).then(result => {
              config.log("", result.insertedCount, type, "inserted, doing adjustments now...")
              if (type == "concepts") {
                let done = 0
                let ids = Object.values(result.insertedIds)
                let dealWithNext = function(index) {
                  if (index >= ids.length) {
                    return Promise.resolve()
                  } else {
                    let _id = ids[index]
                    lastId = _id
                    return db.collection(type).find({ _id: _id }).toArray().then(result => {
                      if (result.length == 0) return
                      let concept = result[0]
                      let keywords = []
                      // Notation, prefLabel, altLabel
                      keywordsNotation = keywords.concat(concept.notation || [])
                      keywordsPrefLabel = keywords.concat((concept.prefLabel && concept.prefLabel.de) ? (Array.isArray(concept.prefLabel.de) ? concept.prefLabel.de : [concept.prefLabel.de]) : [])
                      keywordsAltLabel = keywords.concat((concept.altLabel && concept.altLabel.de) ? (Array.isArray(concept.altLabel.de) ? concept.altLabel.de : [concept.altLabel.de]) : [])
                      return db.collection(type).update({ _id: _id }, { $set: { _keywordsNotation: makePrefixes(keywordsNotation), _keywordsPrefLabel: makeGrams(keywordsPrefLabel), _keywordsAltLabel: makeGrams(keywordsAltLabel),  } })
                    }).then(() => {
                      return terminologyProvider.getNarrower({ uri: _id })
                    }).then(result => {
                      // Add narrower field to object, either [] or [null]
                      let narrower = result.length == 0 ? [] : [null]
                      return db.collection(type).update({ _id: _id }, { $set: { narrower: narrower } })
                    }).then(() => {
                      done += 1
                      if (done % 5000 == 0) {
                        config.log(" -", done, "objects done.")
                      }
                      return dealWithNext(index + 1)
                    }).catch(error => {
                      config.log(error)
                    })
                  }
                }
                let promise = dealWithNext(0)
                return promise
              }
            }).then(() => {
              config.log(" ... adjustments done.")
            }).catch(error => {
              config.log("Error with", lastId)
              config.log(error)
            })
          )

        }
      }
      return Promise.all(promises)
    }).then(() => {
      config.log("Closing database")
      client.close()
    })
})

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
