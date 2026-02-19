// utils/changes.js
import * as jskos from "jskos-tools"
import { ConfigurationError } from "../errors/index.js"

export const collections = {
  voc: "terminologies",
  concepts: "concepts",
  mappings: "mappings",
  concordances: "concordances",
  annotations: "annotations",
  registries: "registries",
}

export const operationTypeMap = { insert: "create", update: "update", delete: "delete" }
export let isChangesApiAvailable = false

export default function registerChangesRoutes(app, db) {
  const connection = db.connection
  for (const [route, collName] of Object.entries(collections)) {
    app.ws(`/${route}/changes`, (ws) => {
      const stream = connection.db
        .collection(collName)
        .watch([], { fullDocument: "updateLookup" })

      stream.on("change", change => {
        const { operationType, documentKey, fullDocument } = change
        const evt = {
          objectType: jskos.guessObjectType(fullDocument),
          type: operationTypeMap[operationType],
          id: documentKey._id,
          timestamp: clusterTimeToISOString(change.clusterTime),
          ...(operationType !== "delete" && { document: fullDocument }),
        }
        ws.send(JSON.stringify(evt))
      })

      stream.on("error", (err) => {
        if (err?.name === "MongoClientClosedError") {
          return
        }
        console.error(
          `[changes] ChangeStream error on "${route}" (${collName}):`,
          err,
        )
      })

      ws.on("close", () => stream.close())
    })
  }
}

// After DB connection, conditionally enable change-stream routes
export async function setupChangesApi(app, config, db) {
  if (!config.changes) {
    console.log("Changes API is disabled by configuration.")
    return
  }

  if (!await db.waitForReplicaSet(config.changes)) {
    throw new ConfigurationError(
      "Changes API enabled, but MongoDB replica set did not initialize in time.",
    )
  }

  // Register WebSocket change-stream endpoints
  registerChangesRoutes(app, db)
  isChangesApiAvailable = true
  console.log("Changes API enabled: replica set confirmed, endpoints are registered.")
}

/**
 * Converts a MongoDB cluster time object to an ISO 8601 string.
 *
 * @param {{ getHighBits: () => number } | null} clusterTime - The cluster time object.
 * @returns {string | null} ISO timestamp derived from the cluster time, or null if input is invalid.
 */
function clusterTimeToISOString(clusterTime) {
  if ((!clusterTime) || (typeof clusterTime.getHighBits !== "function")) {
    return null
  }

  const seconds = clusterTime.getHighBits()
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return null
  }

  return new Date(seconds * 1000).toISOString()
}
