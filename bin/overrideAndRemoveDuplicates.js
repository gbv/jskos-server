#!/usr/bin/env node

/**
 * This is a temporary script to be integrated into the import scripts later.
 *
 * See: https://github.com/gbv/jskos-server/issues/24
 *
 * Usage:
 * cd jskos-server/
 * node scripts/overrideAndRemoveDuplicates.js ../concepts.ndjson
 */

const fs = require("fs")
const readline = require("readline")
const _ = require("lodash")
const file = process.argv[2]

if (!file || !fs.existsSync(file)) {
  console.error("File parameter not given or file does not exist.")
  process.exit(1)
}

const config = require("../config")
const mongo = require("mongodb").MongoClient
function connect() {
  return mongo.connect(config.mongo.url, config.mongo.options).then(client => {
    return { client, db: client.db(config.mongo.db) }
  }).catch(error => {
    config.log(error)
    return { client: null, db: null }
  })
}

const idFromUri = uri => {
  // TODO: Use config.baseUrl instead of hardcoded URL`
  return uri.match(/https:\/\/coli-conc\.gbv\.de\/kenom\/api\/mappings\/(.*)/)[1]
}

var lineReader = readline.createInterface({
  input: fs.createReadStream(file),
})

let mappingsToOverride = []
let mappingsToDelete = []
lineReader.on("line", line => {
  try {
    let mapping = JSON.parse(line)
    let existing = mappingsToOverride.find(m => _.isEqual(_.sortBy(m.identifier), _.sortBy(mapping.identifier)))
    if (existing) {
      mappingsToDelete.push(mapping)
    } else {
      mappingsToOverride.push(mapping)
    }
  } catch(error) {
    console.warn("Error parsing line", error)
  }
})

lineReader.on("close", () => {
  console.log(`${mappingsToOverride.length} mappings to be overridden.`)
  console.log(`${mappingsToDelete.length} duplicate mappings to be deleted.`)
  connect().then(result => {
    let client = result.client
    let db = result.db
    let promises = []

    let inserted = 0
    let modified = 0
    let deleted = 0

    for (let mapping of mappingsToOverride) {
      mapping._id = idFromUri(mapping.uri)
      promises.push(
        db.collection("mappings").replaceOne({ uri: mapping.uri }, mapping, { upsert: true }).then(result => {
          inserted += result.upsertedId ? 1 : 0
          modified += result.modifiedCount
        }),
      )
    }

    for (let mapping of mappingsToDelete) {
      promises.push(
        db.collection("mappings").remove({ uri: mapping.uri }).then(result => {
          deleted += result.result.n
        }),
      )
    }

    // Close client after all operations are done
    Promise.all(promises).then(() => {
      client.close()
      console.log(`${inserted} mappings inserted.`)
      console.log(`${modified} mappings modified.`)
      console.log(`${deleted} mappings deleted.`)
      console.log("Done!")
    })
  })
})
