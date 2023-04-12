import config from "../config/index.js"
import { connection } from "../utils/db.js"

export class StatusService {

  /**
   * Return a Promise with a status object.
   */
  async getStatus() {
    const status = config.status
    status.ok = connection.readyState === 1 ? 1 : 0
    return status
  }

}

export const statusService = new StatusService()
