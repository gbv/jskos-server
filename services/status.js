import { connection } from "../utils/db.js"

export default class StatusService {
  constructor(config) {
    this.config = config
  }

  async getStatus() {
    const status = this.config.status
    status.ok = connection.readyState === 1 ? 1 : 0
    return status
  }

}