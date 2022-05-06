const utils = require("./")
const config = require("../config")
const _ = require("lodash")
const yesno = require("yesno")

class Version {

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
const upgrades = {
  async "1.2.0"() {
    // 1. Additional fields for schemes (full-text search)
    console.log("Creating additional fields for schemes...")
    const Scheme = require("../models/schemes")
    const schemes = await Scheme.find().lean()
    for (let scheme of schemes) {
      utils.searchHelper.addKeywords(scheme)
      await Scheme.findByIdAndUpdate(scheme._id, scheme)
    }
    console.log("... done.")
    // 2. Create indexes for concordances
    console.log("Creating indexes for concordances...")
    const concordanceService = require("../services/concordances")
    await concordanceService.createIndexes()
    console.log("... done.")
    // 3. Create indexes for schemes
    console.log("Creating indexes for schemes...")
    const schemeService = require("../services/schemes")
    await schemeService.createIndexes()
    console.log("... done.")
  },
  async "1.2.2"() {
    // Update text search fields for schemes (full-text search)
    console.log("Updating text search fields for schemes...")
    const Scheme = require("../models/schemes")
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
    const Scheme = require("../models/schemes")
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
    const Scheme = require("../models/schemes")
    const schemes = await Scheme.find().lean()
    for (let scheme of schemes) {
      utils.searchHelper.addKeywords(scheme)
      await Scheme.findByIdAndUpdate(scheme._id, scheme)
    }
    console.log("... done.")
    // 2. Create indexes for schemes
    console.log("Creating indexes for schemes...")
    const schemeService = require("../services/schemes")
    await schemeService.createIndexes()
    console.log("... done.")
  },
  async "1.3"() {
    console.log("Creating indexes for annotations...")
    const annotationService = require("../services/annotations")
    await annotationService.createIndexes()
    console.log("... done.")
  },
  async "1.4"() {
    const Concordance = require("../models/concordances")

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
    const annotationService = require("../services/annotations")
    await annotationService.createIndexes()
    console.log("... done.")

    console.log("- Update annotations to include mapping state in target property...")
    const Mapping = require("../models/mappings")
    const Annotation = require("../models/annotations")

    let updatedCount = 0
    const annotations = await Annotation.find({ "target.state.id": { $exists: false } }).exec()
    for (const annotation of annotations) {
      const target = _.get(annotation, "target.id", annotation.target)
      if (target && target.startsWith && target.startsWith(config.baseUrl + "mappings/")) {
        const mapping = await Mapping.findOne({ uri: target })
        const contentId = mapping && (mapping.identifier || []).find(id => id.startsWith("urn:jskos:mapping:content:"))
        if (contentId) {
          await Annotation.updateOne({ _id: annotation._id }, {
            target: {
              id: target,
              state: {
                id: contentId,
              },
            },
          })
          updatedCount += 1
        }
      }
    }
    console.log(`... done (${updatedCount} annotations updated).`)

  },
}

/**
 * Returns an array of version strings for which upgrades are necessary.
 *
 * @param {string} fromVersion version string
 */
const getUpgrades = (fromVersion, { forceLatest = false }) => {
  const list = []
  fromVersion = Version.from(fromVersion)
  for (let version of Object.keys(upgrades)) {
    if (fromVersion.lt(version) || forceLatest && fromVersion.eq(version)) {
      list.push(version)
    }
  }
  return list
}

module.exports = {
  Version,
  upgrades,
  getUpgrades,
}
