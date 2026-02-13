import { validate } from "jskos-validate"
import jskos from "jskos-tools"
import { SchemeService } from "./schemes.js"
const guessObjectType = jskos.guessObjectType

import { AbstractService } from "./abstract.js"

export class ValidateService extends AbstractService {

  constructor(config) {
    super(config)
    this.schemeService = new SchemeService(config)
  }

  async validate(data, { unknownFields, type, knownSchemes = false } = {}) {
    if (!Array.isArray(data)) {
      data = [data]
    }

    // additional parameters (optional)
    type = (guessObjectType(type, true) || "").toLowerCase()

    const rememberSchemes = type ? null : []
    if (knownSchemes) {
      // Get schemes from schemeService
      knownSchemes = await this.schemeService.getSchemes({})
      type = "concept"
    }
    const validator = type ? validate[type] : validate

    const result = data.map(item => {
      const result = validator(item, { unknownFields, knownSchemes, rememberSchemes })
      return result ? true : validator.errors
    })

    return result
  }

}
