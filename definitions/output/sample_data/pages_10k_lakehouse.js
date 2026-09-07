/**
 * Dataform definition for BigLake Iceberg REST Catalog table sample_data.pages_10k.
 * Underlying Parquet data stored at: gs://httparchive_lakehouse_us/
 *
 * Uses operate() to execute the Iceberg DDL/CTAS statement, stringifying JSON columns
 * to avoid write errors while maintaining open Iceberg format compatibility.
 */
operate('pages_10k_lakehouse', {
  tags: ['lakehouse', 'sample_data']
}).queries(
  (ctx) => `
DROP TABLE IF EXISTS \`httparchive.httparchive_lakehouse_us.sample_data.pages_10k\`;

CREATE OR REPLACE TABLE \`httparchive.httparchive_lakehouse_us.sample_data.pages_10k\`
PARTITION BY date
CLUSTER BY client, is_root_page, rank, page
AS
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
  STRUCT(
    TO_JSON_STRING(custom_metrics.a11y) AS a11y,
    TO_JSON_STRING(custom_metrics.cms) AS cms,
    TO_JSON_STRING(custom_metrics.cookies) AS cookies,
    TO_JSON_STRING(custom_metrics.css_variables) AS css_variables,
    TO_JSON_STRING(custom_metrics.ecommerce) AS ecommerce,
    TO_JSON_STRING(custom_metrics.element_count) AS element_count,
    TO_JSON_STRING(custom_metrics.javascript) AS javascript,
    TO_JSON_STRING(custom_metrics.markup) AS markup,
    TO_JSON_STRING(custom_metrics.media) AS media,
    TO_JSON_STRING(custom_metrics.origin_trials) AS origin_trials,
    TO_JSON_STRING(custom_metrics.performance) AS performance,
    TO_JSON_STRING(custom_metrics.privacy) AS privacy,
    TO_JSON_STRING(custom_metrics.responsive_images) AS responsive_images,
    TO_JSON_STRING(custom_metrics.robots_txt) AS robots_txt,
    TO_JSON_STRING(custom_metrics.security) AS security,
    TO_JSON_STRING(custom_metrics.structured_data) AS structured_data,
    TO_JSON_STRING(custom_metrics.third_parties) AS third_parties,
    TO_JSON_STRING(custom_metrics.well_known) AS well_known,
    TO_JSON_STRING(custom_metrics.wpt_bodies) AS wpt_bodies,
    TO_JSON_STRING(custom_metrics.other) AS other
  ) AS custom_metrics,
  TO_JSON_STRING(lighthouse) AS lighthouse,
  features,
  technologies,
  TO_JSON_STRING(metadata) AS metadata
FROM ${ctx.ref('crawl', 'pages')}
WHERE
  date = '${constants.currentMonth}' AND
  rank <= 10000
`
)
