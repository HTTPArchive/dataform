operate(`all_pages_stable_pre`).tags(
  ["all_pages_stable"]
).queries(`
CREATE SCHEMA IF NOT EXISTS all_dev;

CREATE TABLE \`all_dev.pages_stable\`
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
    performance JSON OPTIONS(description="Performance metrics from WebPageTest"),
    javascript JSON OPTIONS(description="JavaScript metrics from WebPageTest"),
    media JSON OPTIONS(description="Media metrics from WebPageTest"),
    wpt_bodies JSON OPTIONS(description="Response body metrics from WebPageTest"),
    css_variables JSON OPTIONS(description="CSS variables from WebPageTest"),
    responsive_images JSON OPTIONS(description="Responsive images metrics from WebPageTest"),
    markup JSON OPTIONS(description="Markup metrics from WebPageTest"),
    cookies JSON OPTIONS(description="Cookie metrics from WebPageTest"),
    element_count JSON OPTIONS(description="Elements count metrics from WebPageTest"),
    ecommerce JSON OPTIONS(description="Ecommerce metrics from WebPageTest"),
    other JSON OPTIONS(description="Other metrics from WebPageTest")
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
    i===0 ? "all_pages_stable_pre" : `all_pages_stable_update ${iterations[i-1].month} ${iterations[i-1].client}`
  ]).queries(ctx => `
CREATE TEMP FUNCTION PRUNE_OBJECT(
  json_str STRING,
  keys_to_remove ARRAY<STRING>
) RETURNS JSON
LANGUAGE js AS """
try {
  var jsonObject = JSON.parse(json_str);
  keys_to_remove.forEach(function(key) {
    delete jsonObject[key];
  });
  return jsonObject;
} catch (e) {
  return null;
}
""";

INSERT INTO \`all_dev.pages_stable\`
SELECT
  date,
  client,
  page,
  is_root_page,
  root_page,
  rank,
  wptid,
  SAFE.PARSE_JSON(payload, wide_number_mode => 'round') AS payload,
  PRUNE_OBJECT(summary, ["metadata", "pageid", "createDate", "startedDateTime", "archive", "label", "crawlid", "url", "urlhash", "urlShort", "wptid", "wptrun", "rank", "PageSpeed", "_adult_site", "avg_dom_depth", "doctype", "document_height", "document_width", "localstorage_size", "sessionstorage_size", "meta_viewport", "num_iframes", "num_scripts", "num_scripts_sync", "num_scripts_async", "usertiming"]) AS summary,
  STRUCT<css_variables JSON, responsive_images JSON, wpt_bodies JSON, performance JSON, markup JSON, cookies JSON, javascript JSON, media JSON, element_count JSON, ecommerce JSON, other JSON>(
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.css-variables"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.responsive_images"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.wpt_bodies"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.performance"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.markup"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.cookies"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.javascript"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.media"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.element_count"),
    JSON_QUERY(SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round'), "$.ecommerce"),
    PRUNE_OBJECT(custom_metrics, ["css_variables", "responsive_images", "wpt_bodies", "performance", "markup", "cookies", "javascript", "media", "element_count", "ecommerce", "other"])
  ) AS custom_metrics,
  SAFE.PARSE_JSON(lighthouse, wide_number_mode => 'round') AS lighthouse,
  features,
  technologies,
  SAFE.PARSE_JSON(metadata, wide_number_mode => 'round') AS metadata
FROM \`all.pages\`
WHERE
  date = "${iteration.month}" AND
  client = "${iteration.client}" ${constants.dev_rank_filter};
  `)
})