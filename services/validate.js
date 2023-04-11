import validate from "jskos-validate"
import jskos from "jskos-tools"
import { schemeService } from "./schemes.js"
const guessObjectType = jskos.guessObjectType

export class ValidateService {

  constructor() {
    // TODOESM?
    this.schemeService = schemeService
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

export const validateService = new ValidateService()
