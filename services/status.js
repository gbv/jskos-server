const config = require("../config")

class StatusService {

  /**
   * Return a Promise with a status object.
   */
  async getStatus() {
    const { db } = require("../server")
    const status = config.status
    status.ok = db.readyState === 1 ? 1 : 0
    return status
  }

}

module.exports = new StatusService()
