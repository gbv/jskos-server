// utils/changes.js
import * as jskos from "jskos-tools"
import { connection } from "./db.js"  


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


