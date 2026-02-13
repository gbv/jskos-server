import { v4 as uuid } from "uuid"

const uuidRegex = new RegExp(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i)
const isValidUuid = id => id.match(uuidRegex) != null

export { uuid, isValidUuid }