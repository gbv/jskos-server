#!/usr/bin/env node

const meow = require("meow")
const cli = meow(`
Usage
  $ npm run import -- [options] [type input]

  type and input are required unless with options --indexes.
  input can be a .json file (single object or array), an .ndjson file (newline delimited JSON),
  or a URL referring to a JSON or NDJSON source.

  Note that with a URL, it either has to have a proper file ending or provide the correct content type
  (i.e. application/json or application/x-ndjson). If not, the --format option has to be provided.

Options
  GNU long option         Option      Meaning
  --indexes               -i          Create indexes without import (can also be used in addition to import)
  --quiet                 -q          Only output warnings and errors
  --format                -f          Either json or ndjson. Defaults to file ending or content type if available.
  --concordance           -c          Only for mappings. Adds imported mappings into a concordance for specified URI.
                                      The concordance must already exist.

Examples
  $ npm run import -- --indexes
  $ npm run import -- schemes schemes.ndjson
  $ npm run import -- concepts concepts.ndjson
`, {
  flags: {
    reset: {
      type: "boolean",
      alias: "r",
      default: false,
    },
    indexes: {
      type: "boolean",
      alias: "i",
      default: false,
    },
    quiet: {
      type: "boolean",
      alias: "q",
      default: false,
    },
    format: {
      type: "string",
      alias: "f",
      default: "",
    },
    concordance: {
      type: "string",
      alias: "c",
      default: "",
    },
    help: {
      type: "boolean",
      alias: "h",
      default: false,
    },
  },
})

const indexes = cli.flags.indexes

if (cli.flags.help || (!cli.input.length && !indexes)) {
  cli.showHelp()
  process.exit(0)
}

const log = (...args) => {
  if (!cli.flags.quiet) {
    console.log(...args)
  }
}
const logError = ({ message, showHelp = false, exit = false }) => {
  console.error(`  Error: ${message}`)
  if (showHelp) {
    cli.showHelp()
  }
  if (exit) {
    process.exit(1)
  }
}

// --reset was removed
if (cli.flags.reset) {
  logError({
    message: "The option --reset was removed from the import script in version 1.2.0.",
    showHelp: true,
    exit: true,
  })
  // TODO: Mention URL to documentation and/or script that replaces --reset.
}

const jskos = require("jskos-tools")
const fs = require("fs")
const input = cli.input[1] || ""

// Parse type
const type = jskos.guessObjectType(cli.input[0], true)
if (cli.input[0] && !type) {
  logError({
    message: `Invalid <type> argument: ${cli.input[0] || ""}`,
    showHelp: true,
    exit: true,
  })
}
if (!indexes && !type) {
  logError({
    message: "The <type> argument is necessary to import data.",
    showHelp: true,
    exit: true,
  })
}
if (cli.flags.concordance && type != "mapping") {
  logError({
    message: `The -c option is not compatible with type ${type}.`,
    showHelp: true,
    exit: true,
  })
}

// Check input parameter if necessary
const inputIsUrl = !!input.match(/^https?:\/\//)
if (!indexes) {
  if (!input || (!inputIsUrl && !fs.existsSync(input))) {
    logError({
      message: `Invalid or missing <file>: ${input || ""}`,
      showHelp: true,
      exit: true,
    })
  }
}

// Check format parameter
let format
if (["json", "ndjson"].includes(cli.flags.format)) {
  format = cli.flags.format
} else if (cli.flags.format) {
  logError({
    message: `Unknown format ${cli.flags.format}, please provide one of json or ndjson, or leave empty.`,
    showHelp: true,
    exit: true,
  })
}

log(`Start of import script: ${new Date()}`)

// Log all parameters
input && log(`- will import ${type} from ${inputIsUrl ? "URL" : "local file"} ${input}`)
indexes && log("- will create indexes", type ? `for type ${type}` : "for all types")
format && log(`- with format: ${format}`)
log("")

const validate = require("jskos-validate")
const config = require("../config")
const { v5: uuidv5 } = require("uuid")
const path = require("path")
const anystream = require("json-anystream")
const _ = require("lodash")
const mongoose = require("mongoose")

const Container = require("typedi").Container
const services = {
  "scheme": Container.get(require("../services/schemes")),
  "concept": Container.get(require("../services/concepts")),
  "concordance": Container.get(require("../services/concordances")),
  "mapping": Container.get(require("../services/mappings")),
  "annotation": Container.get(require("../services/annotations")),
}
// Also import models for Mapping and Concordance
// TODO: This won't be needed if these are imported through the service as well.
const Mapping = require("../models/mappings")
const Concordance = require("../models/concordances")
const allTypes = Object.keys(services)

  ;
(async () => {
  try {
    await mongoose.connect(`${config.mongo.url}/${config.mongo.db}`, config.mongo.options)
  } catch (error) {
    logError({
      message: error,
      exit: true,
    })
  }
  log("Connection to database established.")
  log()

  if (indexes) {
    log("Creating indexes...")
    let types = type ? [type] : allTypes
    for (let type of types) {
      await services[type].createIndexes()
      log(`... done (${type})`)
    }
    log()
  }

  if (input) {
    let concordance
    if (cli.flags.concordance) {
      // Query concordance from database
      concordance = await Concordance.findById(cli.flags.concordance).lean()
      if (!concordance) {
        logError({
          message: `Concordance with URI ${cli.flags.concordance} not found, aborting...`,
          exit: true,
        })
      }
    }
    try {
      await doImport({ input, format, type, concordance })
    } catch (error) {
      logError({ message: `Import failed - ${error}` })
    }
  }

  mongoose.disconnect()
  log()
  log(`End of import script: ${new Date()}`)
})()

async function doImport({ input, format, type, concordance }) {
  const stream = await anystream.make(input, format)

  if (type == "scheme") {
    log("Importing schemes...")
    const result = await services.scheme.postScheme({
      bodyStream: stream,
      bulk: true,
    })
    log(`... done: ${_.isArray(result) ? result.length : 1} schemes imported.`)
  } else if (type == "concept") {
    log("Importing concepts...")
    // TODO: Find way to output progress.
    const result = await services.concept.postConcept({
      bodyStream: stream,
      bulk: true,
    })
    log(`... done: ${_.isArray(result) ? result.length : 1} concepts imported.`)
  } else if (type == "mapping") {
    // TODO: Eventually, this should also be done through the service.
    let mappings = []
    let imported = 0
    let total = 0
    const saveMappings = async (mappings) => {
      const result = await Mapping.bulkWrite(mappings.map(m => ({
        replaceOne: {
          filter: { _id: m._id },
          replacement: m,
          upsert: true,
        },
      })))
      imported += result.upsertedCount + result.modifiedCount
      console.log(`... ${imported} done ...`)
    }
    for await (let object of stream) {
      total += 1
      if (!validate[type] || !validate[type](object)) {
        logError({ message: `Could not validate ${type} number ${total}: ${object && object.uri}` })
        continue
      }
      // Adjustments for mapping
      if (object.uri) {
        if (object.uri.startsWith(config.baseUrl)) {
          object._id = object.uri.slice(object.uri.lastIndexOf("/") + 1)
        } else {
          // Put URI into identifier because it's not valid for this server
          object.identifier = [].concat(object.identifier || [], object.uri)
          delete object.uri
        }
      }
      // Add reference to concordance.
      if (concordance && concordance.uri) {
        object.partOf = [{
          uri: concordance.uri,
        }]
      }
      // Copy creator from concordance if it doesn't exist.
      if (!object.creator && concordance && concordance.creator) {
        object.creator = concordance.creator
      }
      // Set created of concordance if created is not set
      if (!object.created && concordance && concordance.created) {
        object.created = concordance.created
      }
      // Set modified if necessary
      if (!object.modified && concordance && concordance.modified) {
        object.modified = concordance.modified
      }
      if (!object.modified && object.created) {
        object.modified = object.created
      }
      // Add mapping identifier
      try {
        object.identifier = jskos.addMappingIdentifiers(object).identifier
      } catch (error) {
        log("Could not add identifier to mapping.", error)
      }
      // Generate an identifier and a URI if necessary
      if (!object.uri) {
        const contentIdentifier = object.identifier.find(id => id.startsWith("urn:jskos:mapping:content:"))
        const concordance = _.get(object, "partOf[0].uri") || ""
        if (contentIdentifier) {
          object._id = uuidv5(contentIdentifier + concordance, config.namespace)
          object.uri = config.baseUrl + "mappings/" + object._id
        }
      }
      // Write to mappings
      mappings.push(object)
      if (mappings.length % 5000 == 0) {
        mappings.length && await saveMappings(mappings)
        mappings = []
      }
    }
    mappings.length && await saveMappings(mappings)
    log(`... done: ${imported} mappings imported (${total - imported} skipped).`)
    if (concordance) {
      // Recalculate extent of concordance
      const uri = concordance.uri
      const count = (await Mapping.countDocuments({ "partOf.uri": uri })) || ""
      log(`... recalculated extend of concordance ${uri} to be ${count}...`)
      await Concordance.updateOne({ _id: uri }, {
        $set:
        {
          extent: `${count}`,
          distribution: [
            {
              "download": `${config.baseUrl}mappings?partOf=${encodeURIComponent(uri)}&download=ndjson`,
              "format": "http://format.gbv.de/jskos",
              "mimetype": "application/x-ndjson; charset=utf-8",
            },
            {
              "download": `${config.baseUrl}mappings?partOf=${encodeURIComponent(uri)}&download=csv`,
              "mimetype": "text/csv; charset=utf-8",
            },
          ],
        },
      })
    }
  } else if (type == "concordance") {
    // TODO: Eventually, this should also be done through the service.
    let imported = 0
    let total = 0
    for await (let concordance of stream) {
      total += 1
      // TODO: For testing, uncomment this, otherwise it'll fail validation (`distribution` was mistakenly called `distributions`):
      if (concordance.distributions) {
        concordance.distribution = concordance.distributions
        delete concordance.distributions
      }
      // Validation
      if (!validate[type] || !validate[type](concordance)) {
        logError({ message: `Could not validate ${type} number ${total}: ${concordance && concordance.uri}` })
        continue
      }
      const uri = concordance.uri
      concordance._id = uri
      const result = await Concordance.replaceOne({ _id: concordance._id }, concordance, { upsert: true })
      if (result.nModified + (result.upserted || []).length == 1) {
        imported += 1
        log(`... imported concordance ${uri}, now importing its mappings...`)
        // TODO: Should concordance be dropped?
        let distribution = (concordance.distribution || []).find(element => element.mimetype.includes("json"))
        if (distribution) {
          // Build file URL
          let url = ""
          if (distribution.download.startsWith("http")) {
            url = distribution.download
          } else {
            // ?
            url = path.dirname(input) + "/" + distribution.download
          }
          await doImport({ input: url, type: "mapping", concordance })
        } else {
          log("... no mapping distribution found.")
        }
      }
    }
    log(`... done: ${imported} concordances imported (${total - imported} skipped).`)
  }
}
