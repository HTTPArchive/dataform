const iterations = []
const clients = constants.clients

let midMonth
for (
  let date = '2015-12-01';
  date >= '2015-12-01'; // 2011-06-01
  date = constants.fn_past_month(date)
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

iterations.forEach((iteration, i) => {
  operate(`backfill_summary_pages ${iteration.date} ${iteration.client}`).tags([
    'pages_backfill'
  ]).dependencies([
    i === 0 ? '' : `backfill_summary_pages ${iterations[i - 1].date} ${iterations[i - 1].client}`
  ]).queries(ctx => `
DELETE FROM \`all_dev.pages_stable\`
WHERE date = '${iteration.date}' AND client = '${iteration.client}';

INSERT INTO \`all_dev.pages_stable\`  --${ctx.resolve('all', 'pages')}
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
  TO_JSON( STRUCT(
    pageid,
    createDate,
    archive,
    label,
    crawlid,
    wptid,
    wptrun,
    url,
    urlShort,
    urlhash,
    cdn,
    startedDateTime,
    TTFB,
    renderStart,
    onContentLoaded,
    onLoad,
    fullyLoaded,
    visualComplete,
    PageSpeed,
    SpeedIndex,
    rank,
    reqTotal,
    reqHtml,
    reqJS,
    reqCSS,
    reqImg,
    reqGif,
    reqJpg,
    reqPng,
    reqFont,
    reqFlash,
    reqJson,
    reqOther,
    bytesTotal,
    bytesHtml,
    bytesJS,
    bytesCSS,
    bytesImg,
    bytesGif,
    bytesJpg,
    bytesPng,
    bytesFont,
    bytesFlash,
    bytesJson,
    bytesOther,
    bytesHtmlDoc,
    numDomains,
    maxDomainReqs,
    numRedirects,
    numErrors,
    numGlibs,
    numHttps,
    numCompressed,
    numDomElements,
    maxageNull,
    maxage0,
    maxage1,
    maxage30,
    maxage365,
    maxageMore,
    gzipTotal,
    gzipSavings,
    _connections,
    _adult_site,
    avg_dom_depth,
    document_height,
    document_width,
    localstorage_size,
    sessionstorage_size,
    num_iframes,
    num_scripts,
    doctype,
    meta_viewport
  )) AS payload,
  NULL AS summary,
  NULL AS custom_metrics,
  NULL AS lighthouse,
  NULL AS features,
  NULL AS technologies,
  NULL AS metadata
FROM summary_pages.${constants.fn_date_underscored(iteration.date)}_${iteration.client} AS pages ${constants.dev_TABLESAMPLE};
  `)
})
