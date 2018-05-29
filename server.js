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
  db.collection(config.mongodb.collection).find({
    $or: [
      { "from.memberSet.uri": req.query.from },
      { "to.memberSet.uri": req.query.to }
    ]}).toArray(function(err, results) {
    if (err) {
      res.send(err)
    } else {
      // Remove MongoDB id property from objects
      results.forEach(element => {
        delete element._id
      })
      res.json(results)
    }
  })
})
