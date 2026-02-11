// JSON Schema related

import fs from "node:fs"

export { ajvErrorsToString } from "../utils/ajvErrorsToString.js"

import AJV from "ajv"
import addAjvFormats from "ajv-formats"

export const ajv = new AJV({ allErrors: true })
addAjvFormats(ajv)

import config from "../config/index.js"
const __dirname = config.getDirname(import.meta.url)

export const configSchema = JSON.parse(fs.readFileSync(__dirname + "/../config/config.schema.json"))
ajv.addSchema(configSchema)

export const statusSchema = JSON.parse(fs.readFileSync(__dirname + "/../status.schema.json"))
ajv.addSchema(statusSchema)
