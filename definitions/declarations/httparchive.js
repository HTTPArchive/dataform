// Wappalyzer tables source: https://github.com/HTTPArchive/wappalyzer/blob/main/.github/workflows/upload.yml
;['technologies', 'categories'].forEach((table) =>
  declare({
    schema: 'wappalyzer',
    name: table
  })
)

// Crawl tables copied from crawl_staging via Airflow DAG (crawl_complete)
;['pages', 'requests', 'parsed_css'].forEach((table) =>
  declare({
    schema: 'crawl',
    name: table
  })
)

// Public Suffix List synced via Airflow DAG (crawl_complete)
declare({
  schema: 'urls',
  name: 'public_suffix_list'
})

operate('httparchive_project_options').queries(`
ALTER PROJECT httparchive SET OPTIONS (
  \`region-US.default_sql_dialect_option\` = 'only_google_sql',
  \`region-US.default_query_optimizer_options\` = 'adaptive=on',
  \`region-US.query_runtime\` = 'advanced',
  \`region-US.enable_reservation_based_fairness\` = 'true',
  \`region-US.preflight_fluid_autoscaling_reservations\` = ['pipeline', 'interactive']
);
`)
