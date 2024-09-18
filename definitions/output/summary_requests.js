const current_month_underscored = constants.fn_date_underscored(constants.current_month);

constants.clients.forEach(client => {
    publish(current_month_underscored + "_" + client, {
        type: "table",
        schema: "summary_requests",
        tags: ["crawl_results_legacy"]
    }).query(ctx => `
SELECT
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.requestid') AS INTEGER) AS requestid,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.pageid') AS INTEGER) AS pageid,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.startedDateTime') AS INTEGER) AS startedDateTime,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.time') AS INTEGER) AS time,
  JSON_EXTRACT_SCALAR(summary, '$.method') AS method,
  JSON_EXTRACT_SCALAR(summary, '$.url') AS url,
  JSON_EXTRACT_SCALAR(summary, '$.urlShort') AS urlShort,
  JSON_EXTRACT_SCALAR(summary, '$.redirectUrl') AS redirectUrl,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.firstReq') AS BOOLEAN) AS firstReq,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.firstHtml') AS BOOLEAN) AS firstHtml,
  JSON_EXTRACT_SCALAR(summary, '$.reqHttpVersion') AS reqHttpVersion,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqHeadersSize') AS INTEGER) AS reqHeadersSize,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqBodySize') AS INTEGER) AS reqBodySize,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.reqCookieLen') AS INTEGER) AS reqCookieLen,
  JSON_EXTRACT_SCALAR(summary, '$.reqOtherHeaders') AS reqOtherHeaders,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.status') AS INTEGER) AS status,
  JSON_EXTRACT_SCALAR(summary, '$.respHttpVersion') AS respHttpVersion,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.respHeadersSize') AS INTEGER) AS respHeadersSize,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.respBodySize') AS INTEGER) AS respBodySize,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.respSize') AS INTEGER) AS respSize,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.respCookieLen') AS INTEGER) AS respCookieLen,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.expAge') AS INTEGER) AS expAge,
  JSON_EXTRACT_SCALAR(summary, '$.mimeType') AS mimeType,
  JSON_EXTRACT_SCALAR(summary, '$.respOtherHeaders') AS respOtherHeaders,
  JSON_EXTRACT_SCALAR(summary, '$.req_accept') AS req_accept,
  JSON_EXTRACT_SCALAR(summary, '$.req_accept_charset') AS req_accept_charset,
  JSON_EXTRACT_SCALAR(summary, '$.req_accept_encoding') AS req_accept_encoding,
  JSON_EXTRACT_SCALAR(summary, '$.req_accept_language') AS req_accept_language,
  JSON_EXTRACT_SCALAR(summary, '$.req_connection') AS req_connection,
  JSON_EXTRACT_SCALAR(summary, '$.req_host') AS req_host,
  JSON_EXTRACT_SCALAR(summary, '$.req_if_modified_since') AS req_if_modified_since,
  JSON_EXTRACT_SCALAR(summary, '$.req_if_none_match') AS req_if_none_match,
  JSON_EXTRACT_SCALAR(summary, '$.req_referer') AS req_referer,
  JSON_EXTRACT_SCALAR(summary, '$.req_user_agent') AS req_user_agent,
  JSON_EXTRACT_SCALAR(summary, '$.resp_accept_ranges') AS resp_accept_ranges,
  JSON_EXTRACT_SCALAR(summary, '$.resp_age') AS resp_age,
  JSON_EXTRACT_SCALAR(summary, '$.resp_cache_control') AS resp_cache_control,
  JSON_EXTRACT_SCALAR(summary, '$.resp_connection') AS resp_connection,
  JSON_EXTRACT_SCALAR(summary, '$.resp_content_encoding') AS resp_content_encoding,
  JSON_EXTRACT_SCALAR(summary, '$.resp_content_language') AS resp_content_language,
  JSON_EXTRACT_SCALAR(summary, '$.resp_content_length') AS resp_content_length,
  JSON_EXTRACT_SCALAR(summary, '$.resp_content_location') AS resp_content_location,
  JSON_EXTRACT_SCALAR(summary, '$.resp_content_type') AS resp_content_type,
  JSON_EXTRACT_SCALAR(summary, '$.resp_date') AS resp_date,
  JSON_EXTRACT_SCALAR(summary, '$.resp_etag') AS resp_etag,
  JSON_EXTRACT_SCALAR(summary, '$.resp_expires') AS resp_expires,
  JSON_EXTRACT_SCALAR(summary, '$.resp_keep_alive') AS resp_keep_alive,
  JSON_EXTRACT_SCALAR(summary, '$.resp_last_modified') AS resp_last_modified,
  JSON_EXTRACT_SCALAR(summary, '$.resp_location') AS resp_location,
  JSON_EXTRACT_SCALAR(summary, '$.resp_pragma') AS resp_pragma,
  JSON_EXTRACT_SCALAR(summary, '$.resp_server') AS resp_server,
  JSON_EXTRACT_SCALAR(summary, '$.resp_transfer_encoding') AS resp_transfer_encoding,
  JSON_EXTRACT_SCALAR(summary, '$.resp_vary') AS resp_vary,
  JSON_EXTRACT_SCALAR(summary, '$.resp_via') AS resp_via,
  JSON_EXTRACT_SCALAR(summary, '$.resp_x_powered_by') AS resp_x_powered_by,
  JSON_EXTRACT_SCALAR(summary, '$._cdn_provider') AS _cdn_provider,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$._gzip_save') AS INTEGER) AS _gzip_save,
  SAFE_CAST(JSON_EXTRACT_SCALAR(summary, '$.crawlid') AS INTEGER) AS crawlid,
  JSON_EXTRACT_SCALAR(summary, '$.type') AS type,
  JSON_EXTRACT_SCALAR(summary, '$.ext') AS ext,
  JSON_EXTRACT_SCALAR(summary, '$.format') AS format,
FROM ${ctx.ref("all", "requests")}
WHERE
  date = '${constants.current_month}' AND
  client = 'desktop' AND
  is_root_page AND
  summary IS NOT NULL AND
  JSON_EXTRACT_SCALAR(METADATA, '$.page_id') IS NOT NULL AND
  JSON_EXTRACT_SCALAR(METADATA, '$.page_id') != ''
    `);
});
