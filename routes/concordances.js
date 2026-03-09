import { Router } from "./router.js"

export default config => {
  const router = new Router(config)
  const { concordances } = config

  if (concordances) {
    const service = router.services.concordance

    router.read("/", concordances.read, service, "concordances", ["json", "ndjson"])
    router.readOne(concordances.read, service, "concordance", ["json", "ndjson"])

    router.create("/", concordances.create, service)

    router.update("/", concordances.update, service)
    router.update("/:_id", concordances.update, service)

    router.delete("/", concordances.delete, service)
    router.delete("/:_id", concordances.delete, service)
  }

  return router.router
}
