// utils/changes.js
import * as jskos from "jskos-tools"
import { connection, waitForReplicaSet } from "./db.js"  
import config from "../config/index.js"
import { ConfigurationError } from "../errors/index.js"

export const collections = {
  voc:          "terminologies",
  concepts:     "concepts",
  mappings:     "mappings",
  concordances: "concordances",
  annotations:  "annotations",
}

export const operationTypeMap = { insert: "create", update: "update", delete: "delete" }

export default function registerChangesRoutes(app) {
  for (const [route, collName] of Object.entries(collections)) {
    app.ws(`/${route}/changes`, (ws) => {
      const stream = connection.db
        .collection(collName)
        .watch([], { fullDocument: "updateLookup" })

      stream.on("change", change => {
        const { operationType, documentKey, fullDocument } = change
        const evt = {
          objectType: jskos.guessObjectType(fullDocument),
          type:       operationTypeMap[operationType],
          id:         documentKey._id,
          ...(operationType !== "delete" && { document: fullDocument }),
        }
        ws.send(JSON.stringify(evt))
      })

      ws.on("close", () => stream.close())
    })
  }
}

// After DB connection, conditionally enable change-stream routes
export async function setupChangesApi(app) {
  if (!config.changesApi?.enableChangesApi) {
    console.log("Changes API is disabled by configuration.")
    return
  }

  const ok = await waitForReplicaSet({
    retries: config.changesApi?.rsMaxRetries || 10,
    interval: config.changesApi?.rsRetryInterval || 5000,
  })

  if (!ok) {
    throw new ConfigurationError(
      "Changes API enabled, but MongoDB replica set did not initialize in time.",
    )
  }

  // Register WebSocket change-stream endpoints
  registerChangesRoutes(app)
  console.log("Changes API enabled: replica set confirmed, endpoints are registered.")
}


