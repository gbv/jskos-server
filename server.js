/**
 * Simple GET only API for RVK-GND concordances.
 *
 * If the database doesn't exist yet, import the mappings like this:
 * mongoimport --db rvk_gnd_ubregensburg --collection mappings --file rvk_gnd_ubregensburg.ndjson
 *
 * Download the file from here: http://coli-conc.gbv.de/concordances/
 */

const express = require("express")
const app = express()
const mongo = require("mongodb").MongoClient

mongo.connect("mongodb://localhost", {
  reconnectTries: 60,
  reconnectInterval: 1000,
  bufferMaxEntries: 0
}, (err, client) => {
  if (err) {
    console.log(err)
    process.exit(1)
  }
  db = client.db("rvk_gnd_ubregensburg")
  app.listen(3000, () => {
    console.log("listening on port 3000")
  })
})

// Add headers
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  next()
})

app.get("/mappings", (req, res) => {
  let uri = req.query.uri
  db.collection("mappings").find({ "from.memberSet.uri": uri }).toArray(function(err, results) {
    if (err) {
      res.send(err)
    } else {
      res.json(results)
    }
  })
})
