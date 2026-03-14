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

// After DB connection, conditionally enable change-stream routes
export async function setupChangesApi(app, config, db) {

  if (!config.changes) {
    return
  }

  if (!await db.waitForReplicaSet(config.changes)) {
    throw new ConfigurationError(
      "Changes API enabled, but MongoDB replica set did not initialize in time.",
    )
  }

  // Register WebSocket change-stream endpoints
  const connection = db.connection
  // TODO: allow to configure individual object types, see <https://github.com/gbv/jskos-server/issues/233>
  for (const [route, collName] of Object.entries(collections)) {
    app.ws(`/${route}/changes`, (ws) => {
      const stream = connection.db
        .collection(collName)
        .watch([], { fullDocument: "updateLookup" })

      stream.on("change", change => {
        const { operationType, documentKey, fullDocument, clusterTime } = change
        const evt = {
          objectType: jskos.guessObjectType(fullDocument),
          type: operationTypeMap[operationType],
          id: documentKey._id,
          ...(operationType !== "delete" && { document: fullDocument }),
        }

        // convert MongoDB cluster time object to ISO 8601 string
        if (typeof clusterTime?.getHighBits === "function") {
          const seconds = clusterTime.getHighBits()
          if (typeof seconds === "number" && Number.isFinite(seconds)) {
            evt.timestamp = new Date(seconds * 1000).toISOString()
          }
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
