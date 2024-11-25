operate('reports_complete')
  .tags(['crawl_complete'])
  .dependencies([
    { schema: 'reports_histogram', name: 'bytesTotal' },
    { schema: 'reports_timeseries', name: 'bytesTotal' }
  ]).queries(`
SELECT TRUE;
`)

operate('reports_cwv_tech_complete')
  .tags(['cwv_tech_report'])
  .dependencies([
    { schema: 'reports_cwv_tech', name: 'adoption' },
    { schema: 'reports_cwv_tech', name: 'categories' },
    { schema: 'reports_cwv_tech', name: 'core_web_vitals' },
    { schema: 'reports_cwv_tech', name: 'lighthouse' },
    { schema: 'reports_cwv_tech', name: 'page_weight' },
    { schema: 'reports_cwv_tech', name: 'technologies' }
  ]).queries(`
SELECT TRUE;
`)
