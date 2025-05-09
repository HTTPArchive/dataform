publish('pages_latest', {
  type: 'table',
  schema: 'f1',
  description: 'The latest date from the crawl.pages table',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page']
  },
  tags: ['crawl_complete']
}).preOps(ctx => `
SET @@RESERVATION='projects/httparchive/locations/US/reservations/enterprise';
`).query(ctx => `
SELECT
  date,
  client,
  page,
  is_root_page,
  root_page,
  rank,
  wptid,
  TO_JSON_STRING(payload) AS payload,
  TO_JSON_STRING(summary) AS summary,
  STRUCT<
    a11y STRING,
    cms STRING,
    cookies STRING,
    css_variables STRING,
    ecommerce STRING,
    element_count STRING,
    javascript STRING,
    markup STRING,
    media STRING,
    origin_trials STRING,
    performance STRING,
    privacy STRING,
    responsive_images STRING,
    robots_txt STRING,
    security STRING,
    structured_data STRING,
    third_parties STRING,
    well_known STRING,
    wpt_bodies STRING,
    other STRING
  > (
    TO_JSON_STRING(custom_metrics.a11y),
    TO_JSON_STRING(custom_metrics.cms),
    TO_JSON_STRING(custom_metrics.cookies),
    TO_JSON_STRING(custom_metrics.css_variables),
    TO_JSON_STRING(custom_metrics.ecommerce),
    TO_JSON_STRING(custom_metrics.element_count),
    TO_JSON_STRING(custom_metrics.javascript),
    TO_JSON_STRING(custom_metrics.markup),
    TO_JSON_STRING(custom_metrics.media),
    TO_JSON_STRING(custom_metrics.origin_trials),
    TO_JSON_STRING(custom_metrics.performance),
    TO_JSON_STRING(custom_metrics.privacy),
    TO_JSON_STRING(custom_metrics.responsive_images),
    TO_JSON_STRING(custom_metrics.robots_txt),
    TO_JSON_STRING(custom_metrics.security),
    TO_JSON_STRING(custom_metrics.structured_data),
    TO_JSON_STRING(custom_metrics.third_parties),
    TO_JSON_STRING(custom_metrics.well_known),
    TO_JSON_STRING(custom_metrics.wpt_bodies),
    TO_JSON_STRING(custom_metrics.other)
  ) AS custom_metrics,
  TO_JSON_STRING(lighthouse) AS lighthouse,
  features,
  technologies,
  TO_JSON_STRING(metadata) AS metadata
FROM ${ctx.ref('crawl', 'pages')}
WHERE
  date = '${constants.currentMonth}'
`)
