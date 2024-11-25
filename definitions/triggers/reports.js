operate('reports_complete')
  .tags(['crawl_complete'])
  .dependencies([
    { schema: 'reports_histogram', name: 'bytesTotal' },
    { schema: 'reports_timeseries', name: 'bytesTotal' }
  ]).queries(`
SELECT TRUE;
`)

operate('cwv_tech_reports_complete')
  .tags(['cwv_tech_report'])
  .dependencies([
    { schema: 'cwv_tech_reports', name: 'adoption' },
    { schema: 'cwv_tech_reports', name: 'categories' },
    { schema: 'cwv_tech_reports', name: 'core_web_vitals' },
    { schema: 'cwv_tech_reports', name: 'lighthouse' },
    { schema: 'cwv_tech_reports', name: 'page_weight' },
    { schema: 'cwv_tech_reports', name: 'technologies' }
  ]).queries(`
SELECT TRUE;
`)
