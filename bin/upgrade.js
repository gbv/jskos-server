#!/usr/bin/env node

import { Upgrader } from "../utils/version.js"
import config from "../config/index.js"

const upgrader = new Upgrader(config)

import { createDatabase } from "../utils/db.js"
const db = createDatabase(config)
import { Meta } from "../models/meta.js"

; (async () => {
  await db.connect()
  const meta = await Meta.findOne()
  const list = upgrader.getUpgrades(meta.version, { forceLatest: process.argv.includes("-f") || process.argv.includes("--force-latest") })
  console.log()
  for (const version of list) {
    console.log(`Performing necessary upgrades for version ${version}...`)
    try {
      await upgrader[version]()
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
