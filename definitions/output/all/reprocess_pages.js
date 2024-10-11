operate(`all_pages_stable_pre`).tags(
  ["all_pages_stable"]
).queries(`
CREATE SCHEMA IF NOT EXISTS all_dev;

-- DROP TABLE IF EXISTS \`all_dev.pages_stable\`;

CREATE TABLE IF NOT EXISTS \`all_dev.pages_stable\`
(
  date DATE NOT NULL OPTIONS(description="YYYY-MM-DD format of the HTTP Archive monthly crawl"),
  client STRING NOT NULL OPTIONS(description="Test environment: desktop or mobile"),
  page STRING NOT NULL OPTIONS(description="The URL of the page being tested"),
  is_root_page BOOL NOT NULL OPTIONS(description="Whether the page is the root of the origin"),
  root_page STRING NOT NULL OPTIONS(description="The URL of the root page being tested, the origin followed by /"),
  rank INT64 OPTIONS(description="Site popularity rank, from CrUX"),
  wptid STRING OPTIONS(description="ID of the WebPageTest results"),
  payload JSON OPTIONS(description="JSON-encoded WebPageTest results for the page"),
  summary JSON OPTIONS(description="JSON-encoded summarization of the page-level data"),
  custom_metrics STRUCT<
    a11y JSON,
    cms JSON,
    cookies JSON,
    css_variables JSON,
    ecommerce JSON,
    element_count JSON,
    javascript JSON,
    markup JSON,
    media JSON,
    origin_trials JSON,
    performance JSON,
    privacy JSON,
    responsive_images JSON,
    robots_txt JSON,
    security JSON,
    structured_data JSON,
    third_parties JSON,
    well_known JSON,
    wpt_bodies JSON,
    other JSON
    > OPTIONS(description="Custom metrics from WebPageTest"),
  lighthouse JSON OPTIONS(description="JSON-encoded Lighthouse report"),
  features ARRAY<STRUCT<
    feature STRING OPTIONS(description="Blink feature name"),
    id STRING OPTIONS(description="Blink feature ID"),
    type STRING OPTIONS(description="Blink feature type (css, default)")
    >> OPTIONS(description="Blink features detected at runtime (see https://chromestatus.com/features)"),
  technologies ARRAY<STRUCT<
    technology STRING OPTIONS(description="Name of the detected technology"),
    categories ARRAY<STRING> OPTIONS(description="List of categories to which this technology belongs"),
    info ARRAY<STRING> OPTIONS(description="Additional metadata about the detected technology, ie version number")
    >> OPTIONS(description="Technologies detected at runtime (see https://www.wappalyzer.com/)"),
  metadata JSON OPTIONS(description="Additional metadata about the test")
)
PARTITION BY date
CLUSTER BY client, is_root_page, rank, page
OPTIONS(
  require_partition_filter=true
);
`);


const iterations = [];
const clients = constants.clients;

for (
  let month = constants.current_month;
  month >= '2024-09-01'; // 2022-07-01
  month = constants.fn_past_month(month)) {
  clients.forEach((client) => {
    iterations.push({
      month: month,
      client: client
    })
  })
}

iterations.forEach((iteration, i) => {
  operate(`all_pages_stable_update ${iteration.month} ${iteration.client}`).tags([
    "all_pages_stable"
  ]).dependencies([
    i === 0 ? "all_pages_stable_pre" : `all_pages_stable_update ${iterations[i - 1].month} ${iterations[i - 1].client}`
  ]).queries(ctx => `
DELETE FROM \`all_dev.pages_stable\`
WHERE date = "${iteration.month}" AND
  client = "${iteration.client}";

INSERT INTO \`all_dev.pages_stable\`
SELECT
  date,
  client,
  page,
  is_root_page,
  root_page,
  rank,
  wptid,
  JSON_REMOVE(
    SAFE.PARSE_JSON(payload, wide_number_mode => 'round'),
    '$._metadata',
    '$._detected',
    '$._detected_apps',
    '$._detected_technologies',
    '$._detected_raw',
    '$._custom',
    '$._00_reset',
    '$._a11y',
    '$._ads',
    '$._almanac',
    '$._aurora',
    '$._avg_dom_depth',
    '$._cms',
    '$._Colordepth',
    '$._cookies',
    '$._crawl_links',
    '$._css-variables',
    '$._css',
    '$._doctype',
    '$._document_height',
    '$._document_width',
    '$._Dpi',
    '$._ecommerce',
    '$._element_count',
    '$._event-names',
    '$._fugu-apis',
    '$._generated-content',
    '$._has_shadow_root',
    '$._Images',
    '$._img-loading-attr',
    '$._initiators',
    '$._inline_style_bytes',
    '$._javascript',
    '$._lib-detector-version',
    '$._localstorage_size',
    '$._markup',
    '$._media',
    '$._meta_viewport',
    '$._num_iframes',
    '$._num_scripts_async',
    '$._num_scripts_sync',
    '$._num_scripts',
    '$._observers',
    '$._origin-trials',
    '$._parsed_css',
    '$._performance',
    '$._privacy-sandbox',
    '$._privacy',
    '$._pwa',
    '$._quirks_mode',
    '$._Resolution',
    '$._responsive_images',
    '$._robots_meta',
    '$._robots_txt',
    '$._sass',
    '$._security',
    '$._sessionstorage_size',
    '$._structured-data',
    '$._third-parties',
    '$._usertiming',
    '$._valid-head',
    '$._well-known',
    '$._wpt_bodies',
    '$._blinkFeatureFirstUsed',
    '$._CrUX'
  ) AS payload,
  JSON_SET(
    JSON_REMOVE(
      SAFE.PARSE_JSON(summary, wide_number_mode => 'round'),
      '$._adult_site',
      '$.archive',
      '$.avg_dom_depth',
      '$.crawlid',
      '$.createDate',
      '$.doctype',
      '$.document_height',
      '$.document_width',
      '$.label',
      '$.localstorage_size',
      '$.meta_viewport',
      '$.metadata',
      '$.num_iframes',
      '$.num_scripts_async',
      '$.num_scripts_sync',
      '$.num_scripts',
      '$.pageid',
      '$.PageSpeed',
      '$.rank',
      '$.sessionstorage_size',
      '$.startedDateTime',
      '$.url',
      '$.urlhash',
      '$.urlShort',
      '$.usertiming',
      '$.wptid',
      '$.wptrun'
    ),
    "$.crux",
    JSON_QUERY(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._CrUX")
  ) AS summary,
  STRUCT<
    a11y JSON,
    cms JSON,
    cookies JSON,
    css_variables JSON,
    ecommerce JSON,
    element_count JSON,
    javascript JSON,
    markup JSON,
    media JSON,
    origin_trials JSON,
    performance JSON,
    privacy JSON,
    responsive_images JSON,
    robots_txt JSON,
    security JSON,
    structured_data JSON,
    third_parties JSON,
    well_known JSON,
    wpt_bodies JSON,
    other JSON
  >(
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.a11y"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.cms"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.cookies"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.css-variables"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.ecommerce"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.element_count"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.javascript"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.markup"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.media"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.origin-trials"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.performance"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.privacy"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.responsive_images"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.robots_txt"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.security"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.structured-data"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.third-parties"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.well-known"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.wpt_bodies"),
    JSON_REMOVE(
      SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'),
      '$.a11y',
      '$.cms',
      '$.cookies',
      '$.css-variables',
      '$.ecommerce',
      '$.element_count',
      '$.javascript',
      '$.markup',
      '$.media',
      '$.origin-trials',
      '$.performance',
      '$.privacy',
      '$.responsive_images',
      '$.robots_txt',
      '$.security',
      '$.structured-data',
      '$.third-parties',
      '$.well-known',
      '$.wpt_bodies'
    )
  ) AS custom_metrics,
  SAFE.PARSE_JSON(lighthouse, wide_number_mode => 'round') AS lighthouse,
  features,
  technologies,
  JSON_REMOVE(
    SAFE.PARSE_JSON(metadata, wide_number_mode => 'round'),
    '$.page_id',
    '$.parent_page_id',
    '$.root_page_id'
  ) AS metadata
FROM \`all.pages\`
WHERE
  date = "${iteration.month}" AND
  client = "${iteration.client}" ${constants.dev_rank_filter};
  `)
})
