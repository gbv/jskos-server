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
const app = express()
const mongo = require("mongodb").MongoClient
const MappingProvider = require("./lib/mapping-provider")
const TerminologyProvider = require("./lib/terminology-provider")

// Promise for MongoDB db
const db = mongo.connect(config.mongoUrl, config.mongoOptions).then(client => {
  return client.db(config.mongoDb)
}).catch(error => {
  throw error
})

db.then(db => {
  config.log(`connected to MongoDB ${config.mongoUrl} (database: ${config.mongoDb})`)
  mappingProvider = new MappingProvider(db.collection("mappings"))
  terminologyProvider = new TerminologyProvider(db.collection("terminologies"), db.collection("concepts"))
  app.listen(config.port, () => {
    config.log(`listening on port ${config.port}`)
  })
})

// Add default headers
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Content-Type", "application/ld+json")
  next()
})

app.get("/mappings", (req, res) => {
  mappingProvider.getMappings(req.query)
    .catch(err => res.send(err))
    .then(results => {
      // Remove MongoDB specific fields, add JSKOS specific fields
      results.forEach(mapping => {
        delete mapping._id
        mapping["@context"] = "https://gbv.github.io/jskos/context.json"
      })
      res.json(results)
    })
})

app.get("/mappings/suggest", (req, res) => {
  mappingProvider.getNotationSuggestions(req.query)
    .catch(err => res.send(err))
    .then(results => {
      res.json(results)
    })
})

app.get("/mappings/voc", (req, res) => {
  mappingProvider.getMappingSchemes(req.query)
    .catch(err => res.send(err))
    .then(results => {
      res.json(results)
    })
})

app.get("/voc", (req, res) => {
  terminologyProvider.getVocabularies(req.query)
    .catch(err => res.send(err))
    .then(results => {
      // Remove MongoDB specific fields, add JSKOS specific fields
      results.forEach(scheme => {
        delete scheme._id
        scheme["@context"] = "https://gbv.github.io/jskos/context.json"
      })
      res.json(results)
    })
})

app.get("/data", (req, res) => {
  terminologyProvider.getDetails(req.query)
    .catch(err => res.send(err))
    .then(results => {
      // Remove MongoDB specific fields, add JSKOS specific fields
      results.forEach(concept => {
        delete concept._id
        concept["@context"] = "https://gbv.github.io/jskos/context.json"
      })
      res.json(results)
    })
})

app.get("/voc/top", (req, res) => {
  terminologyProvider.getTop(req.query)
    .catch(err => res.send(err))
    .then(results => {
      // Remove MongoDB specific fields, add JSKOS specific fields
      results.forEach(concept => {
        delete concept._id
        concept["@context"] = "https://gbv.github.io/jskos/context.json"
      })
      res.json(results)
    })
})

app.get("/narrower", (req, res) => {
  terminologyProvider.getNarrower(req.query)
    .catch(err => res.send(err))
    .then(results => {
      // Remove MongoDB specific fields, add JSKOS specific fields
      results.forEach(concept => {
        delete concept._id
        concept["@context"] = "https://gbv.github.io/jskos/context.json"
      })
      res.json(results)
    })
})

app.get("/ancestors", (req, res) => {
  terminologyProvider.getAncestors(req.query)
    .catch(err => res.send(err))
    .then(results => {
      // Remove MongoDB specific fields, add JSKOS specific fields
      results.forEach(concept => {
        delete concept._id
        concept["@context"] = "https://gbv.github.io/jskos/context.json"
      })
      res.json(results)
    })
})

app.get("/suggest", (req, res) => {
  terminologyProvider.getSuggestions(req.query)
    .catch(err => res.send(err))
    .then(results => {
      res.json(results)
    })
})

app.get("/search", (req, res) => {
  terminologyProvider.search(req.query)
    .catch(err => res.send(err))
    .then(results => {
      res.json(results)
    })
})

module.exports = {
  db, app
}
