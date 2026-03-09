import { Router } from "./router.js"

export default config => {
  const router = new Router(config)
  const { registries } = config

  if (registries) {
    const service = router.services.registry

    router.read("/", registries.read, service, "registries")
    router.create("/", registries.create, service)
    router.update("/", registries.update, service)
    router.delete("/", registries.delete, service)
    router.suggest("/suggest", registries.read, service)
  }

  return router.router
}
