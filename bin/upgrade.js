#!/usr/bin/env node

const {
  upgrades,
  getUpgrades,
} = require("../utils/version")

const db = require("../utils/db")
const Meta = require("../models/meta")
  ;
(async () => {
  await db.connect()
  const meta = await Meta.findOne()
  const list = getUpgrades(meta.version)
  console.log()
  for (const version of list) {
    console.log(`Performing necessary upgrades for version ${version}...`)
    try {
      await upgrades[version]()
      meta.version = version
      await meta.save()
      console.log(`... upgrades for version ${version} done.`)
    } catch (error) {
      console.error("Error:", error)
      console.error("aborting...")
      break
    }
    console.log()
  }
  if (!list.length) {
    console.log("No upgrades necessary.")
  }
  db.disconnect()
})()
