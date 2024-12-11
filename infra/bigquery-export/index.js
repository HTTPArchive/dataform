import { ReportsExporter, TechReportsExporter } from './reports.js'

const exportConfig = process.env.EXPORT_CONFIG && JSON.parse(process.env.EXPORT_CONFIG)

async function main (exportConfig) {
  if (!exportConfig) {
    throw new Error('No config received')
  }

  const eventName = exportConfig.dataform_trigger
  if (!eventName) {
    throw new Error('No trigger name found')
  }

  if (eventName === 'report_complete') {
    console.info('Report export')
    console.log(exportConfig)
    const reports = new ReportsExporter()
    await reports.export(exportConfig)
  } else if (eventName === 'report_cwv_tech_complete') {
    console.info('Tech Report export')

    const techReports = new TechReportsExporter()
    await techReports.export(exportConfig)
  } else {
    throw new Error('Bad Request: unknown trigger name')
  }
  return 'OK'
}

await main(exportConfig).catch((error) => {
  console.error(error)
  process.exit(1)
})
