const iterations = []
const clients = constants.clients

for (
  let date = "2016-01-01"; // 2022-06-01
  date >= "2016-01-01"; // 2016-01-01
  date = constants.fn_past_month(date)
) {
  clients.forEach((client) => {
    iterations.push({
      date: date,
      client: client,
    })
  })

  if (date <= "2018-12-01") {
    midMonth = new Date(date)
    midMonth.setDate(15)

    clients.forEach((client) => {
      iterations.push({
        date: midMonth.toISOString().substring(0, 10),
        client: client,
      })
    })
  }
}

iterations.forEach((iteration, i) => {
  operate(`backfill_pages ${iteration.date} ${iteration.client}`).tags([
    "backfill_pages"
  ]).dependencies([
    i===0 ? "" : `backfill_pages ${iterations[i-1].date} ${iterations[i-1].client}`
  ]).queries(ctx => `
DELETE FROM \`all_dev.pages_stable\`
WHERE date = '${iteration.date}' AND client = '${iteration.client}';

CREATE TEMPORARY FUNCTION GET_OTHER_CUSTOM_METRICS(
  jsonObject JSON,
  keys ARRAY<STRING>
) RETURNS JSON
LANGUAGE js AS """
try {
  let other_metrics = {};
  keys.forEach(function(key) {
    other_metrics[key.substr(1)] = JSON.parse(jsonObject[key]);
  });
  return other_metrics;
} catch (e) {
  return null;
}
""";

CREATE TEMP FUNCTION GET_FEATURES(payload STRING)
RETURNS ARRAY<STRUCT<feature STRING, id STRING, type STRING>> LANGUAGE js AS
'''
  function getFeatureNames(featureMap, featureType) {
    try {
      return Object.entries(featureMap).map(([key, value]) => {
        // After Feb 2020 keys are feature IDs.
        if (value.name) {
          return {'feature': value.name, 'type': featureType, 'id': key};
        }
        // Prior to Feb 2020 keys fell back to IDs if the name was unknown.
        if (idPattern.test(key)) {
          return {'feature': '', 'type': featureType, 'id': key.match(idPattern)[1]};
        }
        // Prior to Feb 2020 keys were names by default.
        return {'feature': key, 'type': featureType, 'id': ''};
      });
    } catch (e) {
      return [];
    }
  }
  
  var $ = JSON.parse(payload);
  if (!$._blinkFeatureFirstUsed) return [];
  
  var idPattern = new RegExp('^Feature_(\d+)$');
  return getFeatureNames($._blinkFeatureFirstUsed.Features, 'default')
    .concat(getFeatureNames($._blinkFeatureFirstUsed.CSSFeatures, 'css'))
    .concat(getFeatureNames($._blinkFeatureFirstUsed.AnimatedCSSFeatures, 'animated-css'));
''';

INSERT INTO \`all_dev.pages_stable\`  --${ctx.resolve("all", "pages")}
SELECT
  DATE('${iteration.date}') AS date,
  '${iteration.client}' AS client,
  pages.url AS page,
  TRUE AS is_root_page,
  pages.url AS root_page,
  crux.rank AS rank,
  JSON_VALUE(payload, "$.testID") AS wptid,
  SAFE.PARSE_JSON(payload, wide_number_mode => 'round') AS payload,
  NULL AS summary,
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
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._a11y"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._cms"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._cookies"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._css-variables"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._ecommerce"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._element_count"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._javascript"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._markup"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._media"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._origin-trials"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._performance"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._privacy"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._responsive_images"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._robots_txt"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._security"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._structured-data"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._third-parties"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._well-known"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._wpt_bodies"), wide_number_mode => 'round'),
    GET_OTHER_CUSTOM_METRICS(
      SAFE.PARSE_JSON(payload, wide_number_mode => 'round'),
      ["_Colordepth", "_Dpi", "_Images", "_Resolution", "_almanac", "_avg_dom_depth", "_css", "_doctype", "_document_height", "_document_width", "_event-names", "_fugu-apis", "_has_shadow_root", "_img-loading-attr", "_initiators", "_inline_style_bytes", "_lib-detector-version", "_localstorage_size", "_meta_viewport", "_num_iframes", "_num_scripts", "_num_scripts_async", "_num_scripts_sync", "_pwa", "_quirks_mode", "_sass", "_sessionstorage_size", "_usertiming"]
    )
  ) AS custom_metrics,
  NULL AS lighthouse,
  GET_FEATURES(payload) AS features,
  NULL AS technologies,
  JSON_QUERY(SAFE.PARSE_JSON(payload, wide_number_mode => 'round'), "$._metadata") AS metadata
FROM pages.${constants.fn_date_underscored(iteration.date)}_${iteration.client} AS pages ${constants.dev_TABLESAMPLE}
LEFT JOIN (
  SELECT DISTINCT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.resolve("chrome-ux-report", "experimental", "global")}
  WHERE yyyymm = ${constants.fn_past_month(iteration.date).substring(0, 7).replace('-', '')}
) AS crux
ON pages.url = crux.page;
  `)
})
