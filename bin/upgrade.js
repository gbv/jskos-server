#!/usr/bin/env node

import {
  upgrades,
  getUpgrades,
} from "../utils/version.js"

import * as db from "../utils/db.js"
import { Meta } from "../models/meta.js"

;(async () => {
  await db.connect()
  const meta = await Meta.findOne()
  const list = getUpgrades(meta.version, { forceLatest: process.argv.includes("-f") || process.argv.includes("--force-latest") })
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
