import { models } from "../models/index.js"
import { AbstractService } from "./abstract.js"

export class DataService extends AbstractService {
  async getData(req, authenticator, adjuster) {
    const uris = req.query.uri?.split("|") ?? []
    return [].concat(...await Promise.all(Object.keys(models).map(async type => {

      // Don't return data the user is not authorized to read
      try {
        // FIXME?
        // type = type === "registry" ? "registries" :`${type}s`
        authenticator.checkAccess({ type, action: "read", user: req.user })
      } catch {
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
      return adjuster.data({ req, data: results, type: `${type}s` })
    })))
  }
}
