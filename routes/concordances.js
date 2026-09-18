import { Router } from "./router.js"

export default config => {
  const router = new Router(config)
  const { concordances } = config

  if (concordances) {
    const service = router.services.concordance

    router.read("/", concordances.read, service, ["json", "ndjson"])
    router.readOne(concordances.read, service, ["json", "ndjson"])
    router.create("/", concordances.create, service)
    router.update("/:_id", concordances.update, service)
    router.delete("/:_id", concordances.delete, service)
  }

  return router
}
