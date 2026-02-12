export class Service {
  constructor(config) {
    // logging methods
    this.config = config
    this.log = config.log
    this.warn = config.warn
    this.error = config.error
  }
}
