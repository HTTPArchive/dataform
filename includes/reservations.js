// Reservation references
const RESERVATIONS = {
  HIGH_SLOTS: 'projects/httparchive/locations/US/reservations/pipeline',
  LOW_SLOTS: null,
  ON_DEMAND: 'none',
  DEFAULT: null
}

// Configuration for actions (JSON format for dynamic injection)
const RESERVATION_CONFIG = {
  'highSlots': [
    'httparchive.crawl.pages',
    'httparchive.crawl.requests',
    'httparchive.crawl.parsed_css',
    'httparchive.f1.pages_latest',
    'httparchive.f1.requests_latest'
  ],
  'lowSlots': [],
  'onDemand': [
    'httparchive.dataform_assertions.corrupted_technology_values'
  ]
}

// Convert arrays to Sets for O(1) lookup performance
const RESERVATION_SETS = {
  highSlots: new Set(RESERVATION_CONFIG.highSlots),
  lowSlots: new Set(RESERVATION_CONFIG.lowSlots),
  onDemand: new Set(RESERVATION_CONFIG.onDemand)
}

/**
 * Determines the appropriate reservation for a given action name
 * @param {string} actionName - The fully qualified table name (with or without backticks)
 * @returns {string|null} The reservation identifier or null if no reservation assignment needed
 */
function getReservation(actionName) {
  if (!actionName || typeof actionName !== 'string') {
    return RESERVATIONS.DEFAULT
  }

  // Strip backticks if present and normalize
  const normalizedName = actionName.replace(/`/g, '').trim()

  if (RESERVATION_SETS.highSlots.has(normalizedName)) {
    return RESERVATIONS.HIGH_SLOTS
  } else if (RESERVATION_SETS.lowSlots.has(normalizedName)) {
    return RESERVATIONS.LOW_SLOTS
  } else if (RESERVATION_SETS.onDemand.has(normalizedName)) {
    return RESERVATIONS.ON_DEMAND
  } else {
    return RESERVATIONS.DEFAULT
  }
}

/**
 * Extracts action name from Dataform context object
 * @param {Object} ctx - Dataform context object
 * @returns {string|null} The extracted action name or null if not found
 */
function extractActionName(ctx) {
  if (!ctx) {
    return null
  }

  // Try primary method: ctx.self()
  if (typeof ctx.self === 'function') {
    const selfName = ctx.self()
    if (selfName) {
      return selfName
    }
  }

  // Fallback: construct from proto target
  if (ctx?.operation?.proto?.target) {
    const operationTarget = ctx?.operation?.proto?.target
    const parts = []

    if (operationTarget.database) parts.push(operationTarget.database)
    if (operationTarget.schema) parts.push(operationTarget.schema)
    if (operationTarget.name) parts.push(operationTarget.name)

    return parts.length > 0 ? parts.join('.') : null
  }

  return null
}

/**
 * Generates the reservation SQL statement for a given Dataform context
 * @param {Object} ctx - Dataform context object with self() method and/or proto.target
 * @returns {string} The SQL statement to set reservation or empty string
 */
function reservation_setter(ctx) {
  const actionName = extractActionName(ctx)
  const reservation = getReservation(actionName)
  return reservation ? `SET @@RESERVATION='${reservation}';` : ''
}

module.exports = {
  reservation_setter
}
