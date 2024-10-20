const iterations = []
const clients = constants.clients

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

operate('')

iterations.forEach((iteration, i) => {
  operate(`backfill_requests ${iteration.date} ${iteration.client}`).tags([
    'backfill_requests'
  ]).dependencies([
    i === 0 ? '' : `backfill_requests ${iterations[i - 1].date} ${iterations[i - 1].client}`
  ]).queries(ctx => `
DELETE FROM all_dev.requests_stable
WHERE date = '${iteration.date}'
  AND client = '${iteration.client}';

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

CREATE TEMP FUNCTION parse_headers(headers JSON)
RETURNS ARRAY<STRUCT<name STRING, value STRING>>
LANGUAGE js
AS """
  try {
    return headers.map(header => {
      return { name: header.name, value: header.value };
    });
  } catch (e) {
    return [];
  }
""";

INSERT INTO all_dev.requests_stable
SELECT
  DATE('${iteration.date}') AS date,
  '${iteration.client}' AS client,
  requests.page AS page,
  TRUE AS is_root_page,
  requests.page AS root_page,
  crux.rank AS rank,
  requests.url AS url,
  IF(
    STRING(payload._request_type) = "Document" AND
      MIN(INT64(payload._index)) OVER (PARTITION BY requests.page) = INT64(payload._index),
    TRUE,
    FALSE
  ) AS is_main_document,
  get_type(STRING(payload.response.content.mimeType), ext_from_url) AS type,
  INT64(payload._index) AS index,
  JSON_REMOVE(
    payload,
    '$._headers',
    '$.request.headers',
    '$.response.headers'
  ) AS payload,
  TO_JSON( STRUCT(
    payload.time,
    payload._method AS method,
    NULL AS redirectUrl,
    IFNULL(STRING(payload._protocol), STRING(payload.request.httpVersion)) AS reqHttpVersion,
    payload.request.headersSize AS reqHeadersSize,
    payload.request.bodySize AS reqBodySize,
    NULL AS reqCookieLen,
    payload.response.status,
    payload.response.httpVersion AS respHttpVersion,
    payload.response.headersSize AS respHeadersSize,
    payload.response.bodySize AS respBodySize,
    payload.response.content.size AS respSize,
    NULL AS respCookieLen,
    NULL AS expAge,
    payload.response.content.mimeType,
    payload._cdn_provider,
    payload._gzip_save,
    ext_from_url AS ext,
    NULL AS format
  )) AS summary,
  parse_headers(payload.request.headers) AS request_headers,
  parse_headers(payload.response.headers) AS response_headers,
  response_bodies.body AS response_body
FROM (
  SELECT
    * EXCEPT (payload),
    SAFE.PARSE_JSON(payload, wide_number_mode => 'round') AS payload,
    get_ext_from_url(url) AS ext_from_url
  FROM requests.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} ${constants.devTABLESAMPLE}
) AS requests

LEFT JOIN (
  SELECT DISTINCT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.resolve('chrome-ux-report', 'experimental', 'global')}
  WHERE yyyymm = ${constants.fnPastMonth(iteration.date).substring(0, 7).replace('-', '')}
) AS crux
ON requests.page = crux.page

LEFT JOIN response_bodies.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} AS response_bodies ${constants.devTABLESAMPLE}
ON requests.page = response_bodies.page
  AND requests.url = response_bodies.url;
  `)
})
