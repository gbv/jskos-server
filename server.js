import config from "./config/index.js"
import { createServer } from "./src/server.js"
import portfinder from "portfinder"

import { Database } from "./src/database.js"
const db = new Database(config)

// Connect immediately on startup and check database. TODO: move into class Database?
db.connect(true).then(async () => {
  // TODO: use or merge with serverStatus
  // TODO: `indexExists` causes a deprecation warning. Find a different solution.
  if (config.schemes && !(await db.connection.collection("terminologies").indexExists("text"))) {
    config.warn("Text index on terminologies collection missing. /voc/search and /voc/suggest won't work. Run `npm run import -- --indexes` or `npm run import -- -i schemes` to created indexes.")
  }
  if (config.concepts && !(await db.connection.collection("concepts").indexExists("text"))) {
    config.warn("Text index on concepts collection missing. /concepts/search and /concepts/suggest won't work. Run `npm run import -- --indexes` or `npm run import -- -i concepts` to created indexes.")
  }
  if (config.annotations?.mismatchTagVocabulary?.uri) {
    const concepts = await db.model("concept").find({ "inScheme.uri": config.annotations.mismatchTagVocabulary.uri })
    if (concepts.length === 0) {
      config.warn("annotations.mismatchTagVocabulary is configured, but no data for that vocabulary could be found in the database. Import the vocabulary data into this instance for the setting to work.")
    }
  }
}).catch(error => {
  config.warn("Error connecting to database, reconnect in a few seconds...")
  config.error(error)
})

config.log(`Running in ${config.env} mode.`)

if (!config.baseUrl) {
  config.warn("Warning: If you're using jskos-server behind a reverse proxy, it is necessary to add `baseUrl` to the configuration file!")
}

const app = await createServer(config, db)

if (config.env == "test") {
  portfinder.basePort = config.port
  // TODO: update config.baseUrl
  config.port = await portfinder.getPortPromise()
}

app.listen(config.port, () => {
  config.log(`Now listening on port ${config.port}`)
})

export { app }
