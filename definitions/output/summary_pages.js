const currentMonthUnderscored = constants.fnDateUnderscored(constants.currentMonth)

constants.clients.forEach(client => {
  publish(`${currentMonthUnderscored}_${client}`, {
    type: 'table',
    schema: 'summary_pages',
    tags: ['crawl_results_legacy']
  }).query(ctx => `
SELECT
  SAFE_CAST(JSON_EXTRACT_SCALAR(METADATA, '$.page_id') AS INTEGER) AS pageid,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.createDate') AS INTEGER) AS createDate,
  JSON_EXTRACT_SCALAR(summary, '$.archive') AS archive,
  JSON_EXTRACT_SCALAR(summary, '$.label') AS label,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.crawlid') AS INTEGER) AS crawlid,
  JSON_EXTRACT_SCALAR(summary, '$.wptid') AS wptid,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.wptrun') AS INTEGER) AS wptrun,
  JSON_EXTRACT_SCALAR(summary, '$.url') AS url,
  JSON_EXTRACT_SCALAR(summary, '$.urlShort') AS urlShort,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.urlhash') AS INTEGER) AS urlhash,
  JSON_EXTRACT_SCALAR(summary, '$.cdn') AS cdn,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.startedDateTime') AS INTEGER) AS startedDateTime,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.TTFB') AS INTEGER) AS TTFB,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.renderStart') AS INTEGER) AS renderStart,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.onContentLoaded') AS INTEGER) AS onContentLoaded,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.onLoad') AS INTEGER) AS onLoad,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.fullyLoaded') AS INTEGER) AS fullyLoaded,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.visualComplete') AS INTEGER) AS visualComplete,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.PageSpeed') AS INTEGER) AS PageSpeed,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.SpeedIndex') AS INTEGER) AS SpeedIndex,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.rank') AS INTEGER) AS rank,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqTotal') AS INTEGER) AS reqTotal,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqHtml') AS INTEGER) AS reqHtml,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqJS') AS INTEGER) AS reqJS,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqCss') AS INTEGER) AS reqCSS,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqImg') AS INTEGER) AS reqImg,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqGif') AS INTEGER) AS reqGif,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqJpg') AS INTEGER) AS reqJpg,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqPng') AS INTEGER) AS reqPng,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqFont') AS INTEGER) AS reqFont,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqFlash') AS INTEGER) AS reqFlash,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqJson') AS INTEGER) AS reqJson,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqOther') AS INTEGER) AS reqOther,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesTotal') AS INTEGER) AS bytesTotal,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesHtml') AS INTEGER) AS bytesHtml,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesJS') AS INTEGER) AS bytesJS,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesCss') AS INTEGER) AS bytesCSS,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesImg') AS INTEGER) AS bytesImg,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesGif') AS INTEGER) AS bytesGif,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesJpg') AS INTEGER) AS bytesJpg,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesPng') AS INTEGER) AS bytesPng,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesFont') AS INTEGER) AS bytesFont,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesFlash') AS INTEGER) AS bytesFlash,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesJson') AS INTEGER) AS bytesJson,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesOther') AS INTEGER) AS bytesOther,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesHtmlDoc') AS INTEGER) AS bytesHtmlDoc,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.numDomains') AS INTEGER) AS numDomains,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.maxDomainReqs') AS INTEGER) AS maxDomainReqs,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.numRedirects') AS INTEGER) AS numRedirects,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.numErrors') AS INTEGER) AS numErrors,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.numGlibs') AS INTEGER) AS numGlibs,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.numHttps') AS INTEGER) AS numHttps,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.numCompressed') AS INTEGER) AS numCompressed,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.numDomElements') AS INTEGER) AS numDomElements,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.maxageNull') AS INTEGER) AS maxageNull,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.maxage0') AS INTEGER) AS maxage0,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.maxage1') AS INTEGER) AS maxage1,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.maxage30') AS INTEGER) AS maxage30,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.maxage365') AS INTEGER) AS maxage365,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.maxageMore') AS INTEGER) AS maxageMore,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.gzipTotal') AS INTEGER) AS gzipTotal,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.gzipSavings') AS INTEGER) AS gzipSavings,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$._connections') AS INTEGER) AS _connections,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$._adult_site') AS BOOLEAN) AS _adult_site,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.avg_dom_depth') AS INTEGER) AS avg_dom_depth,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.document_height') AS INTEGER) AS document_height,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.document_width') AS INTEGER) AS document_width,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.localstorage_size') AS INTEGER) AS localstorage_size,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.sessionstorage_size') AS INTEGER) AS sessionstorage_size,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.num_iframes') AS INTEGER) AS num_iframes,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.num_scripts') AS INTEGER) AS num_scripts,
  JSON_EXTRACT_SCALAR(summary, '$.doctype') AS doctype,
  JSON_EXTRACT_SCALAR(summary, '$.meta_viewport') AS meta_viewport,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqAudio') AS INTEGER) AS reqAudio,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqVideo') AS INTEGER) AS reqVideo,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqText') AS INTEGER) AS reqText,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqXml') AS INTEGER) AS reqXml,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqWebp') AS INTEGER) AS reqWebp,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqSvg') AS INTEGER) AS reqSvg,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesAudio') AS INTEGER) AS bytesAudio,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesVideo') AS INTEGER) AS bytesVideo,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesText') AS INTEGER) AS bytesText,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesXml') AS INTEGER) AS bytesXml,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesWebp') AS INTEGER) AS bytesWebp,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.bytesSvg') AS INTEGER) AS bytesSvg,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.num_scripts_async') AS INTEGER) AS num_scripts_async,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.num_scripts_sync') AS INTEGER) AS num_scripts_sync,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.usertiming') AS INTEGER) AS usertiming,
  metadata
FROM ${ctx.ref('all', 'pages')}
WHERE
  date = '${constants.currentMonth}' AND
  client = '${client}' AND
  is_root_page AND
  summary IS NOT NULL AND
  JSON_EXTRACT_SCALAR(metadata, '$.page_id') IS NOT NULL AND
  JSON_EXTRACT_SCALAR(metadata, '$.page_id') != ''
  `)
})
