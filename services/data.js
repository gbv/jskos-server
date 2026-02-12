import { adjust } from "../utils/index.js"
import { models } from "../models/index.js"

import { Service } from "./service.js"

export class DataService extends Service {
  constructor(config) {
    super(config)
  }
  async getData(req) {
    const uris = req.query.uri?.split("|") ?? []
    return [].concat(...await Promise.all(Object.keys(models).map(async type => {
      // Don't return data the user is not authorized to read
      if (!req.isAuthorizedFor({ type: `${type}s`, action: "read" })) {
        return []
      }
      const model = models[type]
      const prop = model.schema.paths.id ? "id" : "uri"
      const results = await model.find({
        $or: [
          { [prop]: { $in: uris } },
          { identifier: { $in: uris } },
        ],
      }).lean()
      // Return adjusted data (needs to be done separately for each data type)
      return adjust.data({ req, data: results, type: `${type}s` })
    })))
  }
}