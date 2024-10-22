const iterations = []
const clients = constants.clients

operate('backfill')

let midMonth
for (
  let date = '2016-01-01';
  date >= '2016-01-01';
  date = constants.fnPastMonth(date)
) {
  clients.forEach((client) => {
    iterations.push({
      date,
      client
    })
  })

  if (date <= '2018-12-01') {
    midMonth = new Date(date)
    midMonth.setDate(15)

    clients.forEach((client) => {
      iterations.push({
        date: midMonth.toISOString().substring(0, 10),
        client
      })
    })
  }
}

iterations.forEach((iteration, i) => {
  operate(`backfill_pages ${iteration.date} ${iteration.client}`).tags([
    'backfill_pages'
  ]).dependencies([
    i === 0 ? 'backfill' : `backfill_pages ${iterations[i - 1].date} ${iterations[i - 1].client}`
  ]).queries(ctx => `
DELETE FROM crawl.pages
WHERE date = '${iteration.date}'
  AND client = '${iteration.client}';

CREATE TEMPORARY FUNCTION getOtherCustomMetrics(
  payload JSON,
  keys ARRAY<STRING>
) RETURNS JSON
LANGUAGE js AS """
try {
  let otherMetrics = {};
  let value = null;
  keys.forEach(function (key) {
    try {
      value = JSON.parse(payload[key])
    } catch (e) {
      value = payload[key]
    }
    otherMetrics[key.substr(1)] = value
  });
  return otherMetrics;
} catch (e) {
  return null;
}
""";

CREATE TEMP FUNCTION getFeatures(blinkFeatureFirstUsed JSON)
RETURNS ARRAY<STRUCT<feature STRING, id STRING, type STRING>>
LANGUAGE js AS
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

  if (!blinkFeatureFirstUsed) return [];

  var idPattern = new RegExp('^Feature_(\\\\d+)$');
  return getFeatureNames(blinkFeatureFirstUsed.Features, 'default')
    .concat(getFeatureNames(blinkFeatureFirstUsed.CSSFeatures, 'css'))
    .concat(getFeatureNames(blinkFeatureFirstUsed.AnimatedCSSFeatures, 'animated-css'));
''';

INSERT INTO crawl.pages
SELECT
  DATE('${iteration.date}') AS date,
  '${iteration.client}' AS client,
  pages.url AS page,
  TRUE AS is_root_page,
  pages.url AS root_page,
  COALESCE(
    crux.rank,
    CASE
      WHEN summary_pages.rank <= 1000 THEN 1000
      WHEN summary_pages.rank <= 5000 THEN 5000
      ELSE NULL
    END
  ) AS rank,
  summary_pages.wptid,
  JSON_REMOVE(
    payload,
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
  TO_JSON( STRUCT(
    SpeedIndex,
    TTFB,
    _connections,
    bytesAudio,
    bytesCSS,
    bytesFlash,
    bytesFont,
    bytesGif,
    bytesHtml,
    bytesHtmlDoc,
    bytesImg,
    bytesJpg,
    bytesJS,
    bytesJson,
    bytesOther,
    bytesPng,
    bytesSvg,
    bytesText,
    bytesTotal,
    bytesVideo,
    bytesWebp,
    bytesXml,
    cdn,
    payload._CrUX,
    fullyLoaded,
    gzipSavings,
    gzipTotal,
    maxDomainReqs,
    maxage0,
    maxage1,
    maxage30,
    maxage365,
    maxageMore,
    maxageNull,
    numCompressed,
    numDomElements,
    numDomains,
    numErrors,
    numGlibs,
    numHttps,
    numRedirects,
    onContentLoaded,
    onLoad,
    renderStart,
    reqAudio,
    reqCSS,
    reqFlash,
    reqFont,
    reqGif,
    reqHtml,
    reqImg,
    reqJpg,
    reqJS,
    reqJson,
    reqOther,
    reqPng,
    reqSvg,
    reqText,
    reqTotal,
    reqVideo,
    reqWebp,
    reqXml,
    visualComplete
  )) AS summary,
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
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._a11y"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._cms"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._cookies"), wide_number_mode => 'round'),
    payload["_css-variables"],
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._ecommerce"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._element_count"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._javascript"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._markup"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._media"), wide_number_mode => 'round'),
    payload["_origin-trials"],
    payload._performance,
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._privacy"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._responsive_images"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._robots_txt"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._security"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._structured-data"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._third-parties"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._well-known"), wide_number_mode => 'round'),
    SAFE.PARSE_JSON(JSON_VALUE(payload, "$._wpt_bodies"), wide_number_mode => 'round'),
    getOtherCustomMetrics(
      payload,
      ["_Colordepth", "_Dpi", "_Images", "_Resolution", "_almanac", "_avg_dom_depth", "_css", "_doctype", "_document_height", "_document_width", "_event-names", "_fugu-apis", "_has_shadow_root", "_img-loading-attr", "_initiators", "_inline_style_bytes", "_lib-detector-version", "_localstorage_size", "_meta_viewport", "_num_iframes", "_num_scripts", "_num_scripts_async", "_num_scripts_sync", "_pwa", "_quirks_mode", "_sass", "_sessionstorage_size", "_usertiming"]
    )
  ) AS custom_metrics,
  NULL AS lighthouse,
  getFeatures(payload._blinkFeatureFirstUsed) AS features,
  tech.technologies AS technologies,
  pages.payload._metadata AS metadata
FROM (
  SELECT
    * EXCEPT(payload),
    SAFE.PARSE_JSON(payload, wide_number_mode => 'round') AS payload
  FROM \`pages.${constants.fnDateUnderscored(iteration.date)}_${iteration.client}\` ${constants.devTABLESAMPLE}
) AS pages

LEFT JOIN summary_pages.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} AS summary_pages ${constants.devTABLESAMPLE}
ON pages.url = summary_pages.url

LEFT JOIN (
  SELECT DISTINCT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.resolve('chrome-ux-report', 'experimental', 'global')}
  WHERE yyyymm = ${constants.fnPastMonth(iteration.date).substring(0, 7).replace('-', '')}
) AS crux
ON pages.url = crux.page

LEFT JOIN (
  SELECT
    page,
    ARRAY_AGG(technology) AS technologies
  FROM(
    SELECT
      url AS page,
      STRUCT<
        technology STRING,
        categories ARRAY<STRING>,
        info ARRAY<STRING>
      >(
        app,
        ARRAY_AGG(category),
        ARRAY_AGG(info)
      ) AS technology
    FROM technologies.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} ${constants.devTABLESAMPLE}
    GROUP BY page, app
  )
  GROUP BY page
) AS tech
ON pages.url = tech.page;
  `)
})