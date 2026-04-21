#!/usr/bin/env node

import meow from "meow"
const cli = meow(`
Usage
  $ npm run import -- [options] [type input]

  type and input are required unless with options --indexes.
  input can be a .json file (single object or array), an .ndjson file (newline delimited JSON),
  a .tsv file (SSSOM/TSV, only for type mapping), or a URL referring to a JSON, NDJSON, or SSSOM/TSV source.

  Note that with a URL, it either has to have a proper file ending (e.g. .json, .ndjson, .tsv) or the
  --format option has to be provided (for JSON/NDJSON, the content type can also be used).

Options
  GNU long option         Option      Meaning
  --indexes               -i          Create indexes without import (can also be used in addition to import)
  --quiet                 -q          Only output warnings and errors
  --format                -f          Either json, ndjson, or sssom (mappings only). Defaults to file ending or content type if available.
  --scheme                -s          For concepts: Adds imported concepts to a scheme for specified URI.
                                      The scheme must already exist. (topConceptOf still needs to be set if applicable.)
                                      For mappings: Controls fromScheme/toScheme handling.
                                      Values: ignore (accept even if missing), lookup (resolve via DB concept lookup),
                                      given (SSSOM only: use subject_source/object_source from SSSOM metadata).
  --concordance           -c          Only for mappings. Adds imported mappings into a concordance for specified URI.
                                      The concordance must already exist.
  --noreplace             -n          EXPERIMENTAL. When given, bulk writing will use insertOne instead of replaceOne,
                                      meaning that existing entities will not be overridden.
                                      Note that an error will be thrown when even one of the entities already exist.
  --nobulk                -b          Disable bulk import no not ignore and filter out invalid entities
  --set-api                           EXPERIMENTAL. Only for concepts. Will update the scheme's \`API\` property after
                                      importing concepts.

Examples
  $ npm run import -- --indexes
  $ npm run import -- schemes schemes.ndjson
  $ npm run import -- concepts concepts.ndjson
  $ npm run import -- registry registries.ndjson
`, {
  importMeta: import.meta,
  flags: {
    reset: {
      type: "boolean",
      shortFlag: "r",
      default: false,
    },
    indexes: {
      type: "boolean",
      shortFlag: "i",
      default: false,
    },
    quiet: {
      type: "boolean",
      shortFlag: "q",
      default: false,
    },
    format: {
      type: "string",
      shortFlag: "f",
      default: "",
    },
    scheme: {
      type: "string",
      shortFlag: "s",
      default: "",
    },
    setApi: {
      type: "boolean",
      default: false,
    },
    concordance: {
      type: "string",
      shortFlag: "c",
      default: "",
    },
    noreplace: {
      type: "boolean",
      shortFlag: "n",
      default: false,
    },
    nobulk: {
      type: "boolean",
      shortFlag: "b",
      default: false,
    },
    help: {
      type: "boolean",
      shortFlag: "h",
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
function error(message) {
  console.error(`  Error: ${message}`)
}
function help(message) {
  error(message)
  cli.showHelp()
  process.exit(1)
}
function fail(message) {
  error(message)
  process.exit(1)
}

// --reset was removed
if (cli.flags.reset) {
  help("The option --reset was removed from the import script in version 1.2.0.")
}

import jskos from "jskos-tools"
import fs from "node:fs"
const input = cli.input[1] || ""

const type = jskos.guessObjectType(cli.input[0], true)
if (cli.input[0] && !type) {
  help(`Invalid <type> argument: ${cli.input[0] || ""}`)
}
if (!indexes && !type) {
  help("The <type> argument is necessary to import data.")
}
if (cli.flags.scheme) {
  if (type === "mapping") {
    if (!["ignore", "lookup", "given"].includes(cli.flags.scheme)) {
      help(`For type mapping, --scheme must be "ignore", "lookup", or "given". Got: ${cli.flags.scheme}`)
    }
  } else if (type !== "concept") {
    help(`The --scheme option is not compatible with type ${type}.`)
  }
}
if (cli.flags.setApi && type != "concept") {
  help(`The --set-api option is not compatible with type ${type}.`)
}
if (cli.flags.concordance && type != "mapping") {
  help(`The -c option is not compatible with type ${type}.`)
}
if (cli.flags.bulk && ["concordance", "concordance", "registry"].find(type)) {
  help(`The --nobulk option is not supported with type ${type}`)
}
if (type == "mapping" && !config.namespace) {
  help(`Import of mappings requires configuration key "namespace", e.g.: ${uuid()}`)
}

// Check input parameter if necessary
const inputIsUrl = !!input.match(/^https?:\/\//)
if (!indexes) {
  if (!input || (!inputIsUrl && !fs.existsSync(input))) {
    help(`Invalid or missing <file>: ${input || ""}`)
  }
}

// Check format parameter
let format
if (["json", "ndjson", "sssom"].includes(cli.flags.format)) {
  format = cli.flags.format
} else if (cli.flags.format) {
  fail(`Unknown format ${cli.flags.format}, please provide one of json, ndjson, or sssom, or leave empty.`)
}
if (format === "sssom" && type !== "mapping") {
  fail("The --format sssom option is only compatible with type mapping.")
}
if (!format && input.endsWith(".tsv") && type !== "mapping") {
  fail("The .tsv file format is only compatible with type mapping.")
}
if (cli.flags.scheme === "given" && type === "mapping" && format !== "sssom" && !input.endsWith(".tsv")) {
  help("The --scheme given option requires SSSOM/TSV format (use --format sssom or a .tsv file).")
}

log(`Start of import script: ${new Date()}`)

// Log all parameters
input && log(`- will import ${type} from ${inputIsUrl ? "URL" : "local file"} ${input}`)
indexes && log("- will create indexes", type ? `for type ${type}` : "for all types")
format && log(`- with format: ${format}`)
log("")

import { validate } from "jskos-validate"
import config from "../config/index.js"
import { v5 as uuidv5, v4 as uuid } from "uuid"
import path from "node:path"
import { Readable } from "node:stream"
import { createReadStream } from "node:fs"
import http from "node:http"
import https from "node:https"
import * as anystream from "json-anystream"
import { TSVReader, toJskosMapping } from "sssom-js"
import { createDatabase } from "../utils/db.js"
const db = createDatabase(config)

import { createServices } from "../services/index.js"
const services = createServices(config)
const allTypes = Object.keys(services)

// Also import models for Mapping and Concordance
// TODO: This won't be needed if these are imported through the service as well.
import { Mapping, Concordance } from "../models/index.js"
import { bulkOperationForEntities, addMappingSchemes } from "../utils/utils.js"

; (async () => {
  try {
    await db.connect()
  } catch (err) {
    fail(err)
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
      concordance = await services.concordance.retrieveItem(cli.flags.concordance)
      if (!concordance) {
        fail(`Concordance with URI ${cli.flags.concordance} not found, aborting...`)
      }
    }
    try {
      await doImport({ input, format, type, concordance })
    } catch (err) {
      error(`[sssom-js] Import failed - ${err}`)
      process.exit(1)
    }
  }

  db.disconnect()
  log()
  log(`End of import script: ${new Date()}`)
})()

async function doImport({ input, format, type, concordance }) {
  const isSSSOM = format === "sssom" || (!format && input.endsWith(".tsv"))
  let bodyStream
  let skippedMappings = 0
  const schemeMode = cli.flags.scheme
  if (isSSSOM) {
    bodyStream = new Readable({ objectMode: true, read() {} })
    const startTSVReader = (sourceStream) => {
      let sssomMetadata = {}
      new TSVReader(sourceStream, { liberal: true })
        .on("metadata", meta => {
          sssomMetadata = meta
        })
        .on("mapping", m => {
          try {
            const jskosMapping = toJskosMapping(m)
            if (schemeMode === "given") {
              if (!jskosMapping.fromScheme && sssomMetadata.subject_source) {
                jskosMapping.fromScheme = { uri: sssomMetadata.subject_source }
              }
              if (!jskosMapping.toScheme && sssomMetadata.object_source) {
                jskosMapping.toScheme = { uri: sssomMetadata.object_source }
              }
            }
            bodyStream.push(jskosMapping)
          } catch (err) {
            skippedMappings++
            error(`[sssom-js] Could not convert SSSOM mapping to JSKOS, mapping skipped. (${err.message})`)
          }
        })
        .on("error", err => bodyStream.destroy(err))
        .on("end", () => bodyStream.push(null))
    }
    if (inputIsUrl) {
      const isHttps = input.startsWith("https://")
      ;(isHttps ? https : http).get(input, (res) => {
        if (res.statusCode !== 200) {
          bodyStream.destroy(new Error(`Requesting SSSOM from URL ${input} failed; status code ${res.statusCode}`))
          return
        }
        startTSVReader(res)
      }).on("error", (err) => bodyStream.destroy(err))
    } else {
      startTSVReader(createReadStream(input, "utf-8"))
    }
  } else {
    bodyStream = await anystream.make(input, format)
  }
  const bulk = !cli.flags.nobulk
  const bulkReplace = !cli.flags.noreplace

  if (type == "scheme") {
    log("Importing schemes...")
    const result = await services.scheme.createItem({ bodyStream, bulk, bulkReplace })
    log(`... done: ${Array.isArray(result) ? result.length : 1} schemes imported.`)
  } else if (type == "concept") {
    log("Importing concepts...")
    // TODO: Find way to output progress.
    const result = await services.concept.createItem({
      bodyStream, bulk, bulkReplace,
      scheme: cli.flags.scheme,
      setApi: cli.flags.setApi,
    })
    log(`... done: ${Array.isArray(result) ? result.length : 1} concepts imported.`)
  } else if (type == "mapping") {
    // TODO: Eventually, this should also be done through the service.
    let mappings = []
    // Keep track of concordances that need to be adjusted
    const concordanceUrisToAdjust = new Set()
    if (concordance?.uri) {
      concordanceUrisToAdjust.add(concordance.uri)
    }
    let imported = 0
    let total = 0
    const saveMappings = async (mappings) => {
      const result = await Mapping.bulkWrite(bulkOperationForEntities({ entities: mappings, replace: !cli.flags.noreplace }))
      imported += result.insertedCount + result.upsertedCount + result.modifiedCount
      console.log(`... ${imported} done ...`)
    }
    // Name the loop
    mappingLoop: for await (let object of bodyStream) {
      total += 1
      if (!validate[type] || !validate[type](object)) {
        error(`Could not validate ${type} number ${total}: ${object && object.uri}`)
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
      if (concordance?.uri) {
        object.partOf = [{
          uri: concordance.uri,
        }]
      } else if (object.partOf?.[0]?.uri) {
        concordanceUrisToAdjust.add(object.partOf?.[0]?.uri)
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
      // Set fromScheme and toScheme from concordance / concept inScheme
      addMappingSchemes(object, { concordance })
      // For lookup mode, resolve missing fromScheme/toScheme via concept DB lookup
      if (schemeMode === "lookup") {
        for (const side of ["from", "to"]) {
          const field = `${side}Scheme`
          if (!object[field]) {
            const concepts = jskos.conceptsOfMapping(object, side)
            for (const concept of concepts) {
              if (concept?.uri) {
                const fullConcept = await services.concept.retrieveItem(concept.uri)
                const schemeUri = fullConcept?.inScheme?.[0]?.uri
                if (schemeUri) {
                  object[field] = { uri: schemeUri }
                  break
                }
              }
            }
          }
        }
      }
      // Check if schemes are available and replace them with URI/notation only
      await services.scheme.replaceSchemeProperties(object, ["fromScheme", "toScheme"])
      // Reject mapping if either fromScheme or toScheme is missing (unless scheme=ignore)
      if (schemeMode !== "ignore") {
        for (let field of ["fromScheme", "toScheme"]) {
          if (!object[field]) {
            const side = field === "fromScheme" ? "from" : "to"
            const conceptUri = object[side]?.memberSet?.[0]?.uri || "unknown"
            const hint = schemeMode === "lookup"
              ? "scheme could not be determined via DB lookup"
              : schemeMode === "given"
                ? "no `subject_source`/`object_source` found in SSSOM metadata"
                : isSSSOM
                  ? "no `subject_source`/`object_source` in SSSOM data and no --concordance given"
                  : "field missing in data and no --concordance given"
            error(`[jskos-server] Skipping mapping number ${total}: \`${field}\` missing for <${conceptUri}> (${hint})`)
            continue mappingLoop
          }
        }
      }
      // Add mapping identifier
      try {
        object.identifier = (await jskos.addMappingIdentifiers(object)).identifier
      } catch (error) {
        log("Could not add identifier to mapping.", error)
      }
      // Generate an identifier and a URI if necessary
      if (!object.uri) {
        const contentIdentifier = object.identifier.find(id => id && id.startsWith("urn:jskos:mapping:content:"))
        const concordance = object.partOf?.[0]?.uri || ""
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
    if (skippedMappings) {
      console.warn(`Warning: ${skippedMappings} SSSOM mapping(s) could not be converted to JSKOS by sssom-js and were skipped.`)
    }
    if (concordanceUrisToAdjust.size) {
      log(`... adjusting extent for ${concordanceUrisToAdjust.size} concordances...`)
      await Promise.all([...concordanceUrisToAdjust].map(uri => services.concordance.postAdjustmentForConcordance(uri)))
      log("... done.")
    }
  } else if (type == "concordance") {
    // TODO: Eventually, this should also be done through the service.
    let imported = 0
    let total = 0
    for await (let concordance of bodyStream) {
      total += 1
      // Rewrite "distribution" to "distributions" if necessary
      if (concordance.distribution) {
        concordance.distributions = concordance.distribution
        delete concordance.distribution
      }
      // Remove distributions with same baseUrl since they will be added dynamically
      if (concordance.distributions) {
        concordance.distributions = concordance.distributions.filter(dist => !dist.download || !dist.download.startsWith(config.baseUrl))
        if (!concordance.distributions.length) {
          delete concordance.distributions
        }
      }
      // Validation
      if (!validate[type] || !validate[type](concordance)) {
        error(`Could not validate ${type} number ${total}: ${concordance && concordance.uri}`)
        continue
      }
      const uri = concordance.uri
      concordance._id = uri
      const result = await Concordance.bulkWrite(bulkOperationForEntities({ entities: [concordance], replace: !cli.flags.noreplace }))
      if (result.insertedCount + result.modifiedCount + result.upsertedCount === 1) {
        imported += 1
        log(`... imported concordance ${uri}, now importing its mappings...`)
        // TODO: Should concordance be dropped?
        let distribution = (concordance.distributions || []).find(element => element.mimetype.includes("json"))
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
  } else if (type == "annotation") {
    log("Importing annotations...")
    // TODO: Find way to output progress.
    const result = await services.annotation.createItem({ bodyStream, bulk, bulkReplace, admin: true })
    log(`... done: ${Array.isArray(result) ? result.length : 1} annotations imported.`)
  } else if (type == "registry") {
    log("Importing registries...")
    const result = await services.registry.createItem({ bodyStream, bulk, bulkReplace })
    const imported = result?.importedCount ?? 0
    const skipped = result?.skippedCount ?? 0
    log(`... done: ${imported} registries imported${skipped > 0 ? ` (${skipped} skipped).` : "."}`)
  }
}
