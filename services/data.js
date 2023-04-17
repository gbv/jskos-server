import { adjust } from "../utils/index.js"
import { byType as models } from "../models/index.js"

export class DataService {
  async getData(req) {
    const uris = req.query.uri?.split("|") ?? []
    return [].concat(...await Promise.all(Object.keys(models).map(async type => {
      // Don't return data the user is not authorized to read
      if (!req.isAuthorizedFor({ type: `${type}s`, action: "read" })) {
        return []
      }
      const model = models[type]
      const results = await model.find({ $or: [
        { uri: { $in: uris } },
        { identifier: { $in: uris } },
      ] }).lean()
      // Return adjusted data (needs to be done separately for each data type)
      return adjust.data({ req, data: results, type: `${type}s` })
    })))
  }
}

export const dataService = new DataService()
