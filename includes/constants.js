const today = new Date().toISOString().substring(0, 10)
const currentMonth = today.substring(0, 8) + '01'
function fnDateUnderscored (dateStr) {
  return dateStr.replaceAll('-', '_')
}
function fnPastMonth (monthISOstring) {
  const monthDate = new Date(monthISOstring)
  monthDate.setMonth(monthDate.getMonth() - 1)
  return monthDate.toISOString().substring(0, 10)
}
const clients = ['desktop', 'mobile']
const booleans = ['FALSE', 'TRUE']
const environment = dataform.projectConfig.vars.environment
const [
  devTABLESAMPLE,
  devRankFilter
] = environment === 'dev'
  ? [
    'TABLESAMPLE SYSTEM (0.001 PERCENT)',
    'AND rank <= 10000'
  ]
  : ['', '']
const bucket = 'httparchive'
const storagePath = 'reports/'
const reservation_id = 'projects/httparchive/locations/US/reservations/pipeline'

class DataformTemplateBuilder {
  /**
   * Create a Dataform SQL template that can be dynamically interpolated
   * @param {function} templateFn - A function that returns the SQL template string
   * @returns {function} A function that can be called with a context to resolve the template
   */
  static create (templateFn) {
    return (ctx, params) => {
      // Custom replacer function to handle nested variables
      const resolveVariable = (path, scope) => {
        // Split the path into parts (handles nested objects like 'constants.devRankFilter')
        const parts = path.split('.')

        // Traverse the provided scope (ctx or global) to find the value
        let value = scope
        for (const part of parts) {
          if (value === undefined || value === null) break
          value = value[part]
        }

        // Convert value to appropriate string representation
        if (value === undefined || value === null) return ''
        if (typeof value === 'string') return `'${value}'`
        if (typeof value === 'number') return value.toString()
        if (typeof value === 'boolean') return value.toString()

        // For objects or arrays, use JSON.stringify
        return JSON.stringify(value)
      }

      // Generate the template with the provided context and global context
      return templateFn(ctx, params).replace(/\${(.*?)}/g, (match, p1) => {
        const [scope, path] = p1.includes(':') ? p1.split(':') : ['params', p1.trim()]
        return scope === 'ctx'
          ? resolveVariable(path.trim(), ctx)
          : resolveVariable(path.trim(), params)
      })
    }
  }
}

module.exports = {
  today,
  currentMonth,
  fnPastMonth,
  fnDateUnderscored,
  clients,
  booleans,
  environment,
  devTABLESAMPLE,
  devRankFilter,
  DataformTemplateBuilder,
  bucket,
  storagePath,
  reservation_id
}
