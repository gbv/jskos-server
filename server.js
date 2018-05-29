/**
 * Simple JSON API to retrieve JSKOS Concept Mappings for mappings between RVK and GND.
 *
 * If the database doesn't exist yet, import the mappings like this:
 * mongoimport --db rvk_gnd_ubregensburg --collection mappings --file rvk_gnd_ubregensburg.ndjson
 *
 * Download the file from here: http://coli-conc.gbv.de/concordances/
 */

const express = require("express")
const app = express()
const mongo = require("mongodb").MongoClient
const config = require("./config")
const MappingProvider = require("./lib/mapping-provider")

let url = `mongodb://${config.mongodb.host}:${config.mongodb.port}`

mongo.connect(url, {
  reconnectTries: 60,
  reconnectInterval: 1000,
  bufferMaxEntries: 0
}, (err, client) => {
  if (err) {
    console.log(err)
    process.exit(1)
  }
  db = client.db(config.mongodb.db)
  provider = new MappingProvider(db.collection(config.mongodb.collection))
  app.listen(config.port, () => {
    console.log(`listening on port ${config.port}`)
  })
})

// Add headers
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  next()
})

app.get("/mappings", (req, res) => {
  provider.getMappings(req.query)
    .catch(err => res.send(err))
    .then(results => {
      // Remove MongoDB id property from objects
      results.forEach(mapping => {
        delete mapping._id
      })
      res.json(results)
    })
})
