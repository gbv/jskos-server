#!/usr/bin/env node

const db = require("../utils/db")
const yesno = require("yesno")
const jskos = require("jskos-tools")
const _ = require("lodash")


const meow = require("meow")
const cli = meow(`
Usage
  $ npm run reset -- [options] [URIs]

  type is required unless you want to reset the whole database.

Options
  GNU long option         Option      Meaning
  --type                  -t          Object type to be deleted. If omitted, type will be "concepts" if -s is given, "mappings" if -c is given, all types otherwise.
  --scheme                -s          Only for concepts. Deletes only concepts from a certain scheme (inScheme). (Not applicable when URIs are specified.)
  --concordance           -c          Only for mappings. Deletes only mappings from a certain concordance (partOf). (Not applicable when URIs are specified.)

Examples
  $ npm run reset -- -t concepts -s http://uri.gbv.de/terminology/rvk/
`, {
  flags: {
    type: {
      type: "string",
      alias: "t",
      default: "",
    },
    scheme: {
      type: "string",
      alias: "s",
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

if (cli.flags.help) {
  cli.showHelp()
  process.exit(0)
}

const log = (...args) => {
  console.log(...args)
}
const logError = ({ message, showHelp = false, exit = false }) => {
  console.error(`  Error: ${message}`)
  if (showHelp) {
    cli.showHelp()
  }
  if (exit) {
    db.disconnect()
    process.exit(1)
  }
}

const uris = cli.input

// Parse type
let type = jskos.guessObjectType(cli.flags.type, true)
let typeInferred = false
if (cli.flags.type && !type) {
  logError({
    message: `Invalid <type> argument: ${cli.flags.type || ""}`,
    showHelp: true,
    exit: true,
  })
}

// Consistentcy checks and inferrence of parameters
if (cli.flags.scheme && cli.flags.concordance) {
  logError({
    message: "Options -s and -c are not compatible with each other.",
    showHelp: true,
    exit: true,
  })
} else if ((cli.flags.scheme || cli.flags.concordance) && uris.length) {
  logError({
    message: "Options -s/-c can't be used when URIs are specified.",
    showHelp: true,
    exit: true,
  })
} else if (cli.flags.scheme && !type) {
  type = "concept"
  typeInferred = true
} else if (cli.flags.concordance && !type) {
  type = "mapping"
  typeInferred = true
} else if (cli.flags.scheme && type != "concept") {
  logError({
    message: `Option -s is not compatible with type ${type}.`,
    showHelp: true,
    exit: true,
  })
} else if (cli.flags.concordance && type != "mapping") {
  logError({
    message: `Option -c is not compatible with type ${type}.`,
    showHelp: true,
    exit: true,
  })
}

const services = {
  scheme: require("../services/schemes"),
  concept: require("../services/concepts"),
  concordance: require("../services/concordances"),
  mapping: require("../services/mappings"),
  annotation: require("../services/annotations"),
}
const models = {
  scheme: require("../models/schemes"),
  concept: require("../models/concepts"),
  concordance: require("../models/concordances"),
  mapping: require("../models/mappings"),
  annotation: require("../models/annotations"),
}
const allTypes = Object.keys(services)

  ;
(async () => {
  // 1. Connect to database.
  try {
    await db.connect()
  } catch (error) {
    logError({
      message: error,
      exit: true,
    })
  }
  log("Connection to database established.")
  log()

  // 2. Figure out what will get deleted.
  const types = type ? [type] : allTypes
  // Prepare scheme/concordance URIs
  let filterUris
  if (cli.flags.scheme) {
    const scheme = await services.scheme.getScheme(cli.flags.scheme)
    if (scheme) {
      filterUris = [scheme.uri].concat(scheme.identifier || [])
    } else {
      filterUris = [cli.flags.scheme]
    }
  } else if (cli.flags.concordance) {
    // Don't support multiple URIs for concordances
    filterUris = [cli.flags.concordance]
  }
  const toBeDeleted = {}
  for (let type of types) {
    const query = {}
    if (!uris.length) {
      // Get list of all URIs from database
      // Apply filters if necessary
      if (cli.flags.scheme) {
        query["inScheme.uri"] = { $in: filterUris }
      } else if (cli.flags.concordance) {
        query["partOf.uri"] = { $in: filterUris }
      }
    } else {
      query._id = { $in: uris }
    }
    toBeDeleted[type] = (await models[type].find(query, { _id: 1 }).lean()).map(r => r._id)
  }

  let question = `Deleting ${uris.length ? "" : "all "}${type ? `${type}s` : "data"}${typeInferred ? " (inferred)" : ""}`
  if (uris.length) {
    question += " with URIs " + uris.join(", ")
  }
  if (cli.flags.scheme) {
    question += ` from scheme ${cli.flags.scheme}`
  } else if (cli.flags.concordance) {
    question += ` from concordance ${cli.flags.concordance}`
  }
  question += " from database.\n"
  let totalCount = 0
  for (let type of types) {
    const count = toBeDeleted[type] && toBeDeleted[type].length
    if (count) {
      question += `- ${count} ${type}s will be deleted.\n`
    }
    totalCount += count
  }
  if (totalCount == 0) {
    logError({
      message: "Did not find any entities to be deleted, aborting...",
      exit: true,
    })
  }
  if (totalCount > 50000) {
    question += "This will take a while.\n"
  }
  question += "Is that okay?"
  const ok = await yesno({
    question,
    defaultValue: false,
  })
  if (!ok) {
    logError({
      message: "Aborting...",
      exit: true,
    })
  }
  log()

  for (let type of types) {
    if (!toBeDeleted[type] || !toBeDeleted[type].length) {
      continue
    }
    log(`Dealing with ${type}s...`)
    for (let chunk of _.chunk(toBeDeleted[type], 50000)) {
      const query = { _id: { $in: chunk } }
      // For concepts, get all schemes to be adjusted later
      let schemeUrisToAdjust = []
      if (type == "concept") {
        schemeUrisToAdjust = await models.concept.distinct("inScheme.uri", query).lean()
      }
      // Delete entities...
      const result = await models[type].deleteMany(query)
      log(`- ${result.deletedCount} ${type}s deleted.`)
      // Adjust schemes
      if (schemeUrisToAdjust.length) {
        log(`- adjusting ${schemeUrisToAdjust.length} schemes...`)
        await services.scheme.postAdjustmentsForScheme(schemeUrisToAdjust.map(uri => ({ uri })))
      }
    }
    log()
  }

  db.disconnect()
  log(`End of import script: ${new Date()}`)
})()
