import * as utils from "./index.js"
import config from "../config/index.js"
import _ from "lodash"
import yesno from "yesno"

import { Scheme, Concordance, Mapping, Annotation } from "../models/index.js"
import { schemeService, concordanceService, annotationService, mappingService, conceptService } from "../services/index.js"

export class Version {

  constructor(version) {
    this.version = version
    const [major = 0, minor = 0, patch = 0] = version.split(".").map(v => parseInt(v))
    this.major = major
    this.minor = minor
    this.patch = patch
  }

  gt(version) {
    version = Version.from(version)
    return this.major > version.major ||
      (this.major == version.major && this.minor > version.minor) ||
      (this.major == version.major && this.minor == version.minor && this.patch > version.patch)
  }
  gte(version) {
    version = Version.from(version)
    return this.major > version.major ||
      (this.major == version.major && this.minor > version.minor) ||
      (this.major == version.major && this.minor == version.minor && this.patch >= version.patch)
  }
  eq(version) {
    return !this.lt(version) && !this.gt(version)
  }
  lt(version) {
    return !this.gte(version)
  }
  lte(version) {
    return !this.gt(version)
  }

  static from(version) {
    return version instanceof Version ? version : new Version(version)
  }

}

/**
 * An object with necessary upgrades.
 * keys = versions
 * values = function that performs upgrades necessary for that version
 */
export const upgrades = {
  async "1.2.0"() {
    // 1. Additional fields for schemes (full-text search)
    console.log("Creating additional fields for schemes...")
    const schemes = await Scheme.find().lean()
    for (let scheme of schemes) {
      utils.searchHelper.addKeywords(scheme)
      await Scheme.findByIdAndUpdate(scheme._id, scheme)
    }
    console.log("... done.")
    // 2. Create indexes for concordances
    console.log("Creating indexes for concordances...")
    await concordanceService.createIndexes()
    console.log("... done.")
    // 3. Create indexes for schemes
    console.log("Creating indexes for schemes...")
    await schemeService.createIndexes()
    console.log("... done.")
  },
  async "1.2.2"() {
    // Update text search fields for schemes (full-text search)
    console.log("Updating text search fields for schemes...")
    const schemes = await Scheme.find().lean()
    for (let scheme of schemes) {
      utils.searchHelper.addKeywords(scheme)
      // Also add modified if it doesn't exist
      scheme.modified = scheme.modified || scheme.created
      await Scheme.findByIdAndUpdate(scheme._id, scheme)
    }
    console.log("... done.")
  },
  async "1.2.3"() {
    // Update text search fields for schemes (full-text search)
    console.log("Updating text search fields for schemes...")
    const schemes = await Scheme.find().lean()
    for (let scheme of schemes) {
      utils.searchHelper.addKeywords(scheme)
      await Scheme.findByIdAndUpdate(scheme._id, scheme)
    }
    console.log("... done.")
  },
  async "1.2.7"() {
    // 1. Update publisher keywords field for schemes
    console.log("Updating publisher keywords fields for schemes...")
    const schemes = await Scheme.find().lean()
    for (let scheme of schemes) {
      utils.searchHelper.addKeywords(scheme)
      await Scheme.findByIdAndUpdate(scheme._id, scheme)
    }
    console.log("... done.")
    // 2. Create indexes for schemes
    console.log("Creating indexes for schemes...")
    await schemeService.createIndexes()
    console.log("... done.")
  },
  async "1.3"() {
    console.log("Creating indexes for annotations...")
    await annotationService.createIndexes()
    console.log("... done.")
  },
  async "1.4"() {
    console.log("Concordances will be upgraded:")
    console.log("- _id will be changed to notation (if available) or a new UUID")
    console.log(`- URI will be adjusted to start with ${config.baseUrl}`)
    console.log("- Previous URI(s) will be moved to identifier")
    console.log("- Distribtions which are served from this instance are removed (will be added dynamically)")
    const ok = await yesno({
      question: "Is that okay?",
      defaultValue: false,
    })
    if (!ok) {
      throw new Error("Aborted due to missing user confirmation.")
    }

    let adjusted = 0
    let failed = 0
    let skipped = 0
    const concordances = await Concordance.find().lean()
    for (const concordance of concordances) {
      const previous_id = concordance._id
      if (!previous_id.startsWith("http")) {
        skipped += 1
        continue
      }
      let _id = concordance.notation[0]
      if (!_id) {
        _id = utils.uuid()
        concordance.notation = [_id].concat((concordance.notation || []).slice(1))
      }
      const identifier = []
      // Add previous _id to identifier
      identifier.push(previous_id)
      // Add previous URI if necessary
      if (previous_id != concordance.uri) {
        identifier.push(concordance.uri)
      }
      // Set new _id and URI, add previous to identifier
      concordance._id = _id
      concordance.uri = `${config.baseUrl}concordances/${_id}`
      console.log(`- Updating concordance ${previous_id} to _id ${_id} (${concordance.uri})`)
      concordance.identifier = (concordance.identifier || []).concat(identifier)
      // Remove distributions that are served by jskos-server and instead add them dynamically
      concordance.distributions = (concordance.distributions || []).filter(dist => !dist.download || !dist.download.startsWith(config.baseUrl))
      if (!concordance.distributions.length) {
        delete concordance.distributions
      }
      // Save concordance
      try {
        await Concordance.insertMany([concordance])
        await Concordance.deleteOne({ _id: previous_id })
        adjusted += 1
      } catch (error) {
        console.error(error)
        failed += 1
      }
    }

    console.log(`- Adjusted: ${adjusted}, skipped: ${skipped}, failed: ${failed}.`)
    console.log("... done")
    if (failed > 0) {
      throw new Error("Not all concordances could be adjusted. Please check the errors and try again.")
    }
  },
  async "1.4.5"() {
    console.log("Upgrades to annotations (see #173):")

    console.log("- Update indexes for annotations...")
    await annotationService.createIndexes()
    console.log("... done.")

    console.log("- Annotations will be updated to use an object for property `target` and to include mapping state if possible...")
    const ok = await yesno({
      question: "Is that okay?",
      defaultValue: false,
    })
    if (!ok) {
      throw new Error("Aborted due to missing user confirmation.")
    }

    let updatedCount = 0
    const annotations = await Annotation.find({ "target.state.id": { $exists: false } }).exec()
    for (const annotation of annotations) {
      const target = _.get(annotation, "target.id", annotation.target)
      const mapping = await Mapping.findOne({ uri: target })
      const contentId = mapping && (mapping.identifier || []).find(id => id.startsWith("urn:jskos:mapping:content:"))
      const update = contentId ? {
        target: {
          id: target,
          state: {
            id: contentId,
          },
        },
      } : {
        target: { id: target },
      }
      await Annotation.updateOne({ _id: annotation._id }, update)
      updatedCount += 1
    }
    console.log(`... done (${updatedCount} annotations updated).`)

  },
  async "1.5.3"() {
    // Create indexes for mappings with index for mappingRelevance
    console.log("Creating indexes for mappings...")
    await mappingService.createIndexes()
    console.log("... done.")
  },
  async "1.6.3"() {
    // Create compound indexes for mappings to create a stable sorting order
    console.log("Creating indexes for mappings...")
    await mappingService.createIndexes()
    console.log("... done.")
  },
  async "2.0.3"() {
    console.log("Adding missing `fromScheme`/`toScheme` fields to mappings...")
    const mappings = await Mapping.aggregate([
      {
        $match: { $or: [{ "fromScheme.uri": { $exists: false } }, {"toScheme.uri": { $exists: false }}] },
      },
      {
        $lookup: {
          from: Concordance.collection.name,
          localField: "partOf.0.uri",
          foreignField: "uri",
          as: "CONCORDANCE",
        },
      },
    ])
    let adjustedCount = 0
    for (const mapping of mappings) {
      const concordance = mapping.CONCORDANCE?.[0]
      const _id = mapping._id
      const hasFromScheme = !!mapping.fromScheme, hasToScheme = !!mapping.toScheme
      delete mapping._id
      delete mapping.CONCORDANCE
      utils.addMappingSchemes(mapping, { concordance })
      if (!hasFromScheme && mapping.fromScheme || !hasToScheme && mapping.toScheme) {
        await Mapping.replaceOne({ _id }, mapping)
        adjustedCount += 1
      }
    }
    console.log(`... done (${adjustedCount} out of ${mappings.length} were adjusted).`)
  },
  async "2.1.0"() {
    console.log("Creating indexes for concepts and annotations...")
    await conceptService.createIndexes()
    await annotationService.createIndexes()
    console.log("... done.")
  },
  async "2.1.6"() {
    console.log("Rewriting concordance URIs for mappings...")

    // Find all concordances with "identifier" set
    const concordances = await Concordance.find({
      "identifier.0": { $exists: true },
    })
    console.log(`- Found ${concordances.length} concordances where updates might be necessary.`)

    let updatedConcordaces = 0, updatedMappings = 0
    for (const concordance of concordances) {
      // Update concordance URIs
      const result = await Mapping.updateMany({
        "partOf.0.uri": {
          $in: concordance.identifier,
        },
      }, {
        "partOf.0.uri": concordance.uri,
      })
      if (result.modifiedCount) {
        updatedConcordaces += 1
        updatedMappings += result.modifiedCount
      }
    }
    if (concordances.length) {
      console.log(`- Updated ${updatedMappings} mappings in ${updatedConcordaces} concordances.`)
    }

    console.log("... done.")
  },
}

/**
 * Returns an array of version strings for which upgrades are necessary.
 *
 * @param {string} fromVersion version string
 */
export const getUpgrades = (fromVersion, { forceLatest = false }) => {
  const list = []
  fromVersion = Version.from(fromVersion)
  for (let version of Object.keys(upgrades)) {
    if (fromVersion.lt(version) || forceLatest && fromVersion.eq(version)) {
      list.push(version)
    }
  }
  return list
}
