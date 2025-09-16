const default_reservation = null
const RESERVATION_CONFIG = [
  {
    tag: 'high_slots',
    reservation: 'projects/httparchive/locations/US/reservations/pipeline',
    actions: [
      'httparchive.crawl.pages',
      'httparchive.crawl.requests',
      'httparchive.crawl.parsed_css',
      'httparchive.f1.pages_latest',
      'httparchive.f1.requests_latest'
    ]
  },
  {
    tag: 'low_slots',
    reservation: null,
    actions: []
  },
  {
    tag: 'on_demand',
    reservation: 'none',
    actions: [
    ]
  }
]

const RESERVATION_SETS = RESERVATION_CONFIG.map(cfg => ({
  ...cfg,
  set: new Set(cfg.actions)
}))


/**
 * Extracts action name from Dataform context object
 * @param {Object} ctx - Dataform context object
 * @returns {string|null} The extracted action name or null if not found
 */
function getActionName(ctx) {
  if (!ctx) return null

  if (typeof ctx.self === 'function' && !ctx?.operation) {
    // Try primary method: ctx.self()
    const selfName = ctx.self()
    if (selfName) return selfName.replace(/`/g, '').trim()
  } else if (ctx?.operation?.proto?.target) {
    // Fallback: construct from proto target
    const t = ctx?.operation?.proto?.target
    return t ? [t.database, t.name].join('.') : null
  }

  return null
}

/**
 * Determines the appropriate reservation for a given action name
 * @param {string} actionName - The action name (without backticks)
 * @returns {string|null} The reservation identifier or null if no reservation assignment needed
 */
function getReservation(actionName) {
  if (!actionName || typeof actionName !== 'string') return default_reservation

  for (const { reservation, set } of Object.values(RESERVATION_SETS)) {
    if (set.has(actionName)) {
      return reservation
    }
  }

  return default_reservation
}


/**
 * Generates the reservation SQL statement for a given Dataform context
 * @param {Object} ctx - Dataform context object with self() method and/or proto.target
 * @returns {string} The SQL statement to set reservation or empty string
 */
function reservation_setter(ctx) {
  const actionName = getActionName(ctx)
  const reservation = getReservation(actionName)
  return reservation ? `SET @@reservation='${reservation}';` : ''
}

module.exports = {
  reservation_setter
}
