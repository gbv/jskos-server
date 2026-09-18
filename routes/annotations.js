import { Router } from "./router.js"

export default config => {
  const router = new Router(config)
  const { annotations } = config

  if (annotations) {
    const service = router.services.annotation

    router.read("/", annotations.read, service)
    router.readOne(annotations.read, service)
    router.create("/", annotations.create, service)
    router.update("/:_id", annotations.update, service)
    router.delete("/:_id", annotations.delete, service)
  }

  return router
}
