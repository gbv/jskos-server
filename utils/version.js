const Container = require("typedi").Container
const utils = require("./")

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
    const concordanceService = Container.get(require("../services/concordances"))
    await concordanceService.createIndexes()
    console.log("... done.")
    // 3. Create indexes for schemes
    console.log("Creating indexes for schemes...")
    const schemeService = Container.get(require("../services/schemes"))
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
    const schemeService = Container.get(require("../services/schemes"))
    await schemeService.createIndexes()
    console.log("... done.")
  },
  async "1.3"() {
    console.log("Creating indexes for annotations...")
    const annotationService = Container.get(require("../services/annotations"))
    await annotationService.createIndexes()
    console.log("... done.")
  },
}

/**
 * Returns an array of version strings for which upgrades are necessary.
 *
 * @param {string} fromVersion version string
 */
const getUpgrades = (fromVersion) => {
  const list = []
  fromVersion = Version.from(fromVersion)
  for (let version of Object.keys(upgrades)) {
    if (fromVersion.lt(version)) {
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
