const iterations = []
const clients = constants.clients

let midMonth
for (
  let date = '2011-06-01';
  date >= '2011-06-01';
  date = constants.fnPastMonth(date)
) {
  clients.forEach((client) => {
    if (
      (date === '2015-09-01' && client === 'mobile') ||
      (date === '2015-06-01' && client === 'mobile') ||
      (date === '2013-12-01')
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
    list += `
      expAge,
      method,
      mimeType,
      redirectUrl,
      reqBodySize,
      reqCookieLen,
      reqHeadersSize,
      respBodySize,
      respCookieLen,
      respHeadersSize,
      respHttpVersion,
      respSize,
      status,
      time`
  }
  if (date >= '2014-05-15') {
    list += `,
      _cdn_provider`
  }
  if (date >= '2014-06-01') {
    list += `,
      _gzip_save`
  }
  if (date >= '2015-05-01') {
    list += `,
      format`
  }
  return list
}

iterations.forEach((iteration, i) => {
  operate(`backfill_summary_requests ${iteration.date} ${iteration.client}`).tags([
    'backfill_summary_requests'
  ]).dependencies([
    i === 0 ? 'backfill' : `backfill_summary_requests ${iterations[i - 1].date} ${iterations[i - 1].client}`
  ]).queries(ctx => `
DELETE FROM crawl.requests
WHERE date = '${iteration.date}' AND client = '${iteration.client}';

CREATE TEMP FUNCTION get_ext_from_url(url STRING)
RETURNS STRING
LANGUAGE js
AS """
  try {
    let ret_ext = url;

    // Remove query parameters
    const i_q = ret_ext.indexOf("?");
    if (i_q > -1) {
      ret_ext = ret_ext.substring(0, i_q);
    }

    // Get the last segment of the path after the last "/"
    ret_ext = ret_ext.substring(ret_ext.lastIndexOf("/") + 1);

    // Find the position of the last dot
    const i_dot = ret_ext.lastIndexOf(".");

    if (i_dot === -1) {
      // No dot means no extension
      ret_ext = "";
    } else {
      // Extract the extension
      ret_ext = ret_ext.substring(i_dot + 1);

      // Weed out overly long extensions
      if (ret_ext.length > 5) {
        ret_ext = "";
      }
    }

    return ret_ext.toLowerCase();
  } catch (e) {
    return ""; // Return an empty string in case of any errors
  }
""";

CREATE TEMP FUNCTION get_type(mime_typ STRING, ext STRING)
RETURNS STRING
LANGUAGE js
AS """
  try {
    mime_typ = mime_typ.toLowerCase();

    // Order by most unique types first
    const uniqueTypes = ["font", "css", "image", "script", "video", "audio", "xml"];
    for (let typ of uniqueTypes) {
      if (mime_typ.includes(typ)) {
        return typ;
      }
    }

    // Special cases
    if (mime_typ.includes("json") || ["js", "json"].includes(ext)) {
      return "script";
    } else if (["eot", "ttf", "woff", "woff2", "otf"].includes(ext)) {
      return "font";
    } else if (
      ["png", "gif", "jpg", "jpeg", "webp", "ico", "svg", "avif", "jxl", "heic", "heif"].includes(ext)
    ) {
      return "image";
    } else if (ext === "css") {
      return "css";
    } else if (ext === "xml") {
      return "xml";
    } else if (
      ["mp4", "webm", "ts", "m4v", "m4s", "mov", "ogv", "swf", "f4v", "flv"].includes(ext) ||
      ["flash", "webm", "mp4", "flv"].some(typ => mime_typ.includes(typ))
    ) {
      return "video";
    } else if (mime_typ.includes("wasm") || ext === "wasm") {
      return "wasm";
    } else if (mime_typ.includes("html") || ["html", "htm"].includes(ext)) {
      return "html";
    } else if (mime_typ.includes("text")) {
      // Put "text" last because it is often misused, so extension should take precedence.
      return "text";
    } else {
      return "other";
    }
  } catch (e) {
    return "other"; // Return "other" if there's any error
  }
""";

CREATE TEMP FUNCTION parse_headers(headers STRING)
RETURNS ARRAY<STRUCT<name STRING, value STRING>>
LANGUAGE js
AS r"""
  if (!headers) return []

  try {
    const parsedHeaders = headers.split(/,\\s/).map(header => {
      const [name, ...valueParts] = header.split(/\\s=\\s/);
      if (name && valueParts.length > 0) {
        return { name: name.trim(), value: valueParts.join('=').trim() };
      }
      return null;
    });

    return parsedHeaders.filter(Boolean);
  } catch (e) {
    return [];
  }
""";

INSERT INTO crawl.requests
SELECT
  DATE('${iteration.date}') AS date,
  '${iteration.client}' AS client,
  pages.url AS page,
  TRUE AS is_root_page,
  pages.url AS root_page,
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
  requests.url AS url,
  requests.firstHTML AS is_main_document,
  get_type(requests.mimeType, requests.ext_from_url) AS type,
  IF(requests.firstReq, 1, NULL) AS index,
  NULL AS payload,
  TO_JSON( STRUCT(
    ext_from_url AS ext,
    ${summaryObject(iteration.date)}
  )) AS summary,
  ARRAY_CONCAT(
    ARRAY<STRUCT<name string, value string>>[
      ('Accept', requests.req_accept),
      ("Accept-Charset", requests.req_accept_charset),
      ("Accept-Encoding", requests.req_accept_encoding),
      ("Accept-Language", requests.req_accept_language),
      ("Connection", requests.req_connection),
      ("Host", requests.req_host),
      ("If-Modified-Since", requests.req_if_modified_since),
      ("If-None-Match", requests.req_if_none_match),
      ("Referer", requests.req_referer),
      ("User-Agent", requests.req_user_agent)
    ],
    parse_headers(requests.reqOtherHeaders)
  ) AS request_headers,
  ARRAY_CONCAT(
    ARRAY<STRUCT<name string, value string>>[
      ("Accept-Ranges", requests.resp_accept_ranges),
      ("Age", requests.resp_age),
      ("Cache-Control", requests.resp_cache_control),
      ("Connection", requests.resp_connection),
      ("Content-Encoding", requests.resp_content_encoding),
      ("Content-Language", requests.resp_content_language),
      ("Content-Length", requests.resp_content_length),
      ("Content-Location", requests.resp_content_location),
      ("Content-Type", requests.resp_content_type),
      ("Date", requests.resp_date),
      ("ETag", requests.resp_etag),
      ("Expires", requests.resp_expires),
      ("Keep-Alive", requests.resp_keep_alive),
      ("Last-Modified", requests.resp_last_modified),
      ("Location", requests.resp_location),
      ("Pragma", requests.resp_pragma),
      ("Server", requests.resp_server),
      ("Transfer-Encoding", requests.resp_transfer_encoding),
      ("Vary", requests.resp_vary),
      ("Via", requests.resp_via),
      ("X-Powered-By", requests.resp_x_powered_by)
    ],
    parse_headers(requests.respOtherHeaders)
  ) AS response_headers,
  NULL AS response_body
FROM (
  SELECT
    *,
    get_ext_from_url(url) AS ext_from_url
  FROM summary_requests.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} ${constants.devTABLESAMPLE}
) AS requests
LEFT JOIN (
  SELECT DISTINCT
    url,
    pageid,
    rank
  FROM summary_pages.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} ${constants.devTABLESAMPLE}
) AS pages
ON requests.pageid = pages.pageid;
  `)
})
