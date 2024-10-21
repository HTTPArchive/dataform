const iterations = []
const clients = constants.clients

let midMonth
for (
  let date = '2015-12-01';
  date >= '2015-12-01';
  date = constants.fnPastMonth(date)
) {
  clients.forEach((client) => {
    iterations.push({
      date,
      client
    })
  })

  midMonth = new Date(date)
  midMonth.setDate(15)

  clients.forEach((client) => {
    iterations.push({
      date: midMonth.toISOString().substring(0, 10),
      client
    })
  })
}

function summaryObject (date) {
  let list = ''
  if (date >= '2010-11-15') {
    list += `
      fullyLoaded,
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
      bytesTotal,
      cdn,
      gzipSavings,
      gzipTotal,
      maxage0,
      maxage1,
      maxage30,
      maxage365,
      maxageMore,
      maxageNull,
      maxDomainReqs,
      numCompressed,
      numDomains,
      numDomElements,
      numErrors,
      numGlibs,
      numHttps,
      numRedirects,
      onContentLoaded,
      onLoad,
      renderStart,
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
      reqTotal,
      SpeedIndex,
      TTFB,
      visualComplete`
  }
  if (date >= '2014-05-15') {
    list += `,
      _connections`
  }
  if (date >= '2015-05-01') {
    list += `,
      bytesAudio,
      bytesSvg,
      bytesText,
      bytesVideo,
      bytesWebp,
      bytesXml,
      reqAudio,
      reqSvg,
      reqText,
      reqVideo,
      reqWebp,
      reqXml`
  }
  return list
}

function customMetrics (date) {
  let list = ''
  if (date >= '2014-06-01' && date !== '2014-05-15') {
    list += `
      avg_dom_depth,
      doctype,
      document_height,
      document_width,
      localstorage_size,
      meta_viewport,
      num_iframes,
      num_scripts,
      sessionstorage_size`
  }
  if (date >= '2015-11-01') {
    list += `,
      num_scripts_async,
      num_scripts_sync`
  }
  return list
}

iterations.forEach((iteration, i) => {
  operate(`backfill_summary_pages ${iteration.date} ${iteration.client}`).tags([
    'pages_backfill'
  ]).dependencies([
    i === 0 ? '' : `backfill_summary_pages ${iterations[i - 1].date} ${iterations[i - 1].client}`
  ]).queries(ctx => `
DELETE FROM crawl.pages
WHERE date = '${iteration.date}'
  AND client = '${iteration.client}';

INSERT INTO crawl.pages
SELECT
  DATE('${iteration.date}') AS date,
  '${iteration.client}' AS client,
  pages.url AS page,
  TRUE AS is_root_page,
  pages.url AS root_page,
  CASE
    WHEN rank<=1000 THEN 1000
    WHEN rank<=5000 THEN 5000
    ELSE NULL
    END AS rank,
  wptid,
  NULL AS payload,
  TO_JSON( STRUCT(
    ${summaryObject(iteration.date)}
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
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    TO_JSON( STRUCT(
      ${customMetrics(iteration.date)}
    ))
  ) AS custom_metrics,
  NULL AS lighthouse,
  NULL AS features,
  NULL AS technologies,
  NULL AS metadata
FROM summary_pages.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} AS pages ${constants.devTABLESAMPLE};
  `)
})
