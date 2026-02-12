import { connection } from "../utils/db.js"

import { Service } from "./service.js"

export default class StatusService extends Service {
  constructor(config) {
    super(config)
  }

  async getStatus() {
    const status = this.config.status
    status.ok = connection.readyState === 1 ? 1 : 0
    return status
  }

}