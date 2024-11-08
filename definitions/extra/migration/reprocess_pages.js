operate('reprocess')

const iterations = []
const clients = constants.clients

for (
  let month = '2022-03-01'; month >= '2022-03-01'; month = constants.fnPastMonth(month)) {
  clients.forEach((client) => {
    iterations.push({
      month,
      client
    })
  })
}

iterations.forEach((iteration, i) => {
  operate(`reprocess_pages ${iteration.month} ${iteration.client}`).tags([
    'reprocess_pages'
  ]).dependencies([
    i === 0 ? 'reprocess' : `reprocess_pages ${iterations[i - 1].month} ${iterations[i - 1].client}`
  ]).queries(ctx => `
DELETE FROM crawl.pages
WHERE date = '${iteration.month}' AND
  client = '${iteration.client}';

INSERT INTO crawl.pages
SELECT
  date,
  client,
  page,
  is_root_page,
  root_page,
  rank,
  wptid,
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
  JSON_SET(
    JSON_REMOVE(
      summary,
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
    '$.crux',
    payload._CrUX
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
    custom_metrics.a11y,
    custom_metrics.cms,
    custom_metrics.cookies,
    custom_metrics["css-variables"],
    custom_metrics.ecommerce,
    custom_metrics.element_count,
    custom_metrics.javascript,
    custom_metrics.markup,
    custom_metrics.media,
    custom_metrics["origin-trials"],
    custom_metrics.performance,
    custom_metrics.privacy,
    custom_metrics.responsive_images,
    custom_metrics.robots_txt,
    custom_metrics.security,
    custom_metrics["structured-data"],
    custom_metrics["third-parties"],
    custom_metrics["well-known"],
    custom_metrics.wpt_bodies,
    JSON_REMOVE(
      custom_metrics,
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
  lighthouse,
  features,
  technologies,
  JSON_REMOVE(
    metadata,
    '$.page_id',
    '$.parent_page_id',
    '$.root_page_id'
  ) AS metadata
FROM (
  SELECT
    * EXCEPT (custom_metrics, lighthouse, metadata, payload, summary),
    SAFE.PARSE_JSON(custom_metrics, wide_number_mode => 'round') AS custom_metrics,
    SAFE.PARSE_JSON(lighthouse, wide_number_mode => 'round') AS lighthouse,
    SAFE.PARSE_JSON(metadata, wide_number_mode => 'round') AS metadata,
    SAFE.PARSE_JSON(payload, wide_number_mode => 'round') AS payload,
    SAFE.PARSE_JSON(summary, wide_number_mode => 'round') AS summary
  FROM \`all.pages\`
  WHERE date = '${iteration.month}' AND
    client = '${iteration.client}' ${constants.devRankFilter}
);
  `)
})
