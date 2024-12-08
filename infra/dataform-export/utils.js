import crypto from 'crypto'

/**
 * Returns a hashed ID for a set of technology query keys. Keys are sorted alphabetically and joined with a dash.
 * The resulting string is hashed using SHA256.
 *
 * @param {Object} element - The input object containing query data.
 * @param {string} queryType - The type of query to generate the hash for.
 * @param {Object} keyMap - The mapping of query types to their keys. Defaults to constants.TECHNOLOGY_QUERY_ID_KEYS.
 * @returns {string} - The hashed ID.
 * @throws {Error} - If the queryType is invalid or if required keys are missing in the element.
 */
export function technologyHashId (element, queryType, keyMap) {
  if (!keyMap[queryType]) {
    throw new Error(`Invalid query type: ${queryType}`)
  }

  const keys = keyMap[queryType].sort()
  if (!keys.every(key => key in element)) {
    throw new Error(`Missing keys in element ${JSON.stringify(element)} for query type ${queryType}`)
  }

  const values = keys.map(key => element[key])
  const hash = crypto.createHash('sha256')
    .update(values.join('-'))
    .digest('hex')

  return hash
}
