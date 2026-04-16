#!/usr/bin/env node

import { Upgrader } from "../utils/version.js"
import config from "../config/index.js"

const upgrader = new Upgrader(config)

import { createDatabase } from "../utils/db.js"
const db = createDatabase(config)
import { Meta } from "../models/meta.js"

await (async () => {
  await db.connect({ upgrade: false })
  const meta = await Meta.findOne()
  const list = upgrader.getUpgrades(meta.version, { forceLatest: process.argv.includes("-f") || process.argv.includes("--force-latest") })
  console.log()
  if (list.length) {
    try {
      await upgrader.performUpgrades(list, meta)
    } catch (error) {
      console.error("Error:", error)
      console.error("aborting...")
    }
  } else {
    console.log("No upgrades necessary.")
  }
  db.disconnect()
})()
