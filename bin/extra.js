#!/usr/bin/env node

import yesno from "yesno"
import * as db from "../utils/db.js"
import { schemeService } from "../services/schemes.js"
import jskos from "jskos-tools"
import { Mapping } from "../models/mappings.js"

/**
 * Map of async scripts.
 *
 * Note that a connection to the database will be established before the script is called.
 */
const scripts = {
  async supplementNotationsInMappings() {
    const mappings = await Mapping.find({
      $or: [
        { "from.memberSet.notation": { $exists: false }, "from.memberSet.uri": { $exists: true } },
        { "to.memberSet.notation": { $exists: false }, "to.memberSet.uri": { $exists: true } },
      ],
    })

    console.log(`Found ${mappings.length} mappings with missing notations...`)

    if (mappings.length && !(await yesno({
      question: `Update ${mappings.length} mappings with notations (if possible)?`,
      defaultValue: false,
    }))) {
      console.log("Aborting...")
      await db.disconnect()
      return
    }

    let changedMappings = 0
    for (const mapping of mappings) {
      const changedPaths = []
      for (const side of ["from", "to"]) {
        let scheme = mapping[`${side}Scheme`]
        let concepts = mapping[side].memberSet
        scheme = await schemeService.getScheme(scheme.uri)
        scheme = scheme && new jskos.ConceptScheme(scheme)
        if (!scheme) {
          continue
        }
        concepts.forEach((concept, index) => {
          if (concept.notation && concept.notation.length) {
            return
          }
          const notation = scheme.notationFromUri(concept.uri)
          if (!notation) {
            return
          }
          concept.notation = [notation]
          changedPaths.push(`${side}.memberSet.${index}.notation`)
        })
      }
      if (changedPaths.length) {
        changedPaths.forEach(path => mapping.markModified(path))
        await mapping.save()
        changedMappings += 1
      }
    }

    console.log(`- Supplemented ${changedMappings} mappings with notations.`)
    console.log(`- ${mappings.length - changedMappings} mappings could not be adjusted.`)
  },
}

const scriptName = process.argv[2]

if (!scripts[scriptName]) {
  console.error(`No supplemental script with name ${scriptName} could be found. The following scripts are available:`)
  Object.keys(scripts).forEach(name => console.log(`- ${name}`))
  process.exit(1)
}

(async function() {
  await db.connect(false)
  await scripts[scriptName]()
  await db.disconnect()
})()
