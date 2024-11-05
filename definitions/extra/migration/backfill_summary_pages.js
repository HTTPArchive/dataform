const iterations = []
const clients = constants.clients

let midMonth
for (
  let date = '2012-12-01';
  date >= '2011-06-01';
  date = constants.fnPastMonth(date)
) {
  clients.forEach((client) => {
    if (
      (date === '2013-12-01' && client === 'mobile')
    ) { return true } else {
      iterations.push({
        date,
        client
      })
    }
  })

  midMonth = new Date(date)
  midMonth.setDate(15)
  midMonth = midMonth.toISOString().substring(0, 10)

  clients.forEach((client) => {
    if (
      (midMonth === '2014-06-15' && client === 'mobile') ||
      (midMonth === '2013-07-15')
    ) { return true } else {
      iterations.push({
        date: midMonth,
        client
      })
    }
  })
}

function summaryObject (date) {
  let list = ''
  if (date >= '2010-11-15') {
    list += `fullyLoaded,
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
    list += `avg_dom_depth,
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
    'backfill_summary_pages'
  ]).dependencies([
    i === 0 ? 'backfill' : `backfill_summary_pages ${iterations[i - 1].date} ${iterations[i - 1].client}`
  ]).queries(ctx => `
DELETE FROM crawl.pages
WHERE date = '${iteration.date}'
  AND client = '${iteration.client}';

INSERT INTO crawl.pages
SELECT
  DATE('${iteration.date}') AS date,
  '${iteration.client}' AS client,
  url AS page,
  TRUE AS is_root_page,
  url AS root_page,
  CASE
    WHEN rank = 0 THEN NULL
    WHEN rank<=1000 THEN 1000
    WHEN rank<=5000 THEN 5000
    WHEN rank<=10000 THEN 10000
    WHEN rank<=50000 THEN 50000
    WHEN rank<=100000 THEN 100000
    WHEN rank<=500000 THEN 500000
    WHEN rank<=1000000 THEN 1000000
    WHEN rank<=5000000 THEN 5000000
    WHEN rank<=10000000 THEN 10000000
    WHEN rank<=50000000 THEN 50000000
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
FROM summary_pages.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} ${constants.devTABLESAMPLE};
  `)
})
