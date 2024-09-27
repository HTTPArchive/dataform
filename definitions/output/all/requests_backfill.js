
let monthRange = [];
for (
  let month = '2022-08-01';
  month >= '2022-08-01'; //2016-01-01
  month = constants.fn_past_month(month)) {
    monthRange.push(month)
}

monthRange.forEach((month, i) => {
  constants.clients.forEach(client => {
    operate(`requests_backfill ${month}_${client}`).tags([
      "requests_backfill"
    ]).queries(ctx => `
DELETE FROM ${ctx.resolve("all", "requests")}
WHERE date = '${month}';

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
AS """
  try {
    return JSON.parse(headers).map(header => {
      return { name: header.name, value: header.value };
    });
  } catch (e) {
    return [];
  }
""";

INSERT INTO ${ctx.resolve("all", "requests")}
SELECT
  DATE('${month}') AS date,
  '${client}' AS client,
  requests.page AS page,
  TRUE AS is_root_page,
  requests.page AS root_page,
  requests.url AS url,
  IF(
    SAFE_CAST(JSON_EXTRACT_SCALAR(payload, '$._request_type') AS STRING) = "Document" AND
      MIN(SAFE_CAST(JSON_EXTRACT_SCALAR(payload, '$._index') AS INT64)) OVER (PARTITION BY page) = SAFE_CAST(JSON_EXTRACT_SCALAR(payload, '$._index') AS INT64),
    TRUE,
    FALSE
  ) AS is_main_document,
  get_type(JSON_VALUE(requests.payload, '$.response.content.mimeType'), get_ext_from_url(requests.url)) AS type,
  SAFE_CAST(JSON_EXTRACT_SCALAR(payload, '$._index') AS INT64) AS index,
  requests.payload AS payload,
  TO_JSON_STRING( STRUCT(
    SAFE_CAST(JSON_VALUE(requests.payload, '$.time') AS INTEGER) AS time,
    JSON_VALUE(requests.payload, '$._method') AS method,
    NULL AS redirectUrl,
    JSON_VALUE(requests.payload, '$.request.httpVersion') AS reqHttpVersion,
    JSON_VALUE(requests.payload, '$.request.headersSize') AS reqHeadersSize,
    JSON_VALUE(requests.payload, '$.request.bodySize') AS reqBodySize,
    NULL AS reqCookieLen,
    JSON_VALUE(requests.payload, '$.response.status') AS status,
    JSON_VALUE(requests.payload, '$.response.httpVersion') AS respHttpVersion,
    JSON_VALUE(requests.payload, '$.response.headersSize') AS respHeadersSize,
    JSON_VALUE(requests.payload, '$.response.bodySize') AS respBodySize,
    JSON_VALUE(requests.payload, '$.response.content.size') AS respSize,
    NULL AS respCookieLen,
    NULL AS expAge,
    JSON_VALUE(requests.payload, '$.response.content.mimeType') AS mimeType,
    JSON_VALUE(requests.payload, '$._cdn_provider') AS _cdn_provide,
    JSON_VALUE(requests.payload, '$._gzip_save') AS _gzip_save,
    NULL AS ext,
    NULL AS format
  )) AS summary,
  parse_headers(JSON_QUERY(payload, '$.request.headers')) AS request_headers,
  parse_headers(JSON_QUERY(payload, '$.response.headers')) AS response_headers,
  response_bodies.body AS response_body
FROM requests.${constants.fn_date_underscored(month)}_${client} AS requests ${constants.dev_TABLESAMPLE}
LEFT JOIN response_bodies.${constants.fn_date_underscored(month)}_${client} AS response_bodies ${constants.dev_TABLESAMPLE}
USING (page, url);
    `)
  })
})