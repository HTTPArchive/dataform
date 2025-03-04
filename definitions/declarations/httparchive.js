// Staging tables source: https://github.com/HTTPArchive/crawl/blob/main/crawl.py
['pages', 'requests', 'parsed_css'].forEach(table =>
  declare({
    schema: 'crawl_staging',
    name: table
  })
)

// See https://github.com/HTTPArchive/dataform/issues/43
assert('corrupted_technology_values')
  .tags(['crawl_complete'])
  .query(ctx => `
SELECT
  date,
  client,
  tech,
  COUNT(DISTINCT page) AS cnt_pages,
  ARRAY_AGG(DISTINCT page LIMIT 3) AS sample_pages
FROM ${ctx.ref('crawl_staging', 'pages')} AS pages
LEFT JOIN pages.technologies AS tech
LEFT JOIN tech.categories AS category
WHERE
  date = '${constants.currentMonth}' AND
  (
    tech.technology NOT IN (SELECT DISTINCT name FROM wappalyzer.technologies)
    OR category NOT IN (SELECT DISTINCT name FROM wappalyzer.categories)
    OR ARRAY_LENGTH(tech.categories) = 0
  )
GROUP BY
  date,
  client,
  tech
ORDER BY cnt_pages DESC
`);

// Wappalyzer tables source: https://github.com/HTTPArchive/wappalyzer/blob/main/.github/workflows/upload.yml
['technologies', 'categories'].forEach(table =>
  declare({
    schema: 'wappalyzer',
    name: table
  })
)

operate('create_reservation_assignment')
  .tags(['crawl_complete'])
  .queries(ctx => `
CREATE ASSIGNMENT
\`httparchive.region-us.retrospective-reprocessing.pipeline\`
OPTIONS (
  assignee = 'projects/httparchive',
  job_type = 'QUERY')
`)

operate('drop_reservation_assignment')
  .dependencies(['requests_10k'])
  .tags(['crawl_complete'])
  .queries(ctx => `
DROP ASSIGNMENT IF EXISTS
\`httparchive.region-us.retrospective-reprocessing.pipeline\`
`)
