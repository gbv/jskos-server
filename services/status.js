const status = require("../config").status

module.exports = class StatusService {

  /**
   * Return a Promise with a status object.
   */
  async getStatus() {
    const { db } = require("../server")
    status.ok = db.readyState === 1 ? 1 : 0
    return status
  }

}
