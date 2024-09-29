let datesRange = [];
for (
  let date = '2011-06-01'; // 2015-12-01
  date >= '2011-06-01';
  date = constants.fn_past_month(date)) {
    datesRange.push(date)

    midMonth = new Date(date);
    midMonth.setDate(15);
    datesRange.push(midMonth.toISOString().substring(0, 10))
}

datesRange.forEach((date, i) => {
  if(date > "2014-06-01"){
    add_dimensions = true;
  } else {
    add_dimensions = false;
  }

  constants.clients.forEach(client => {
    operate(`requests_backfill_summary ${date}_${client}`).tags([
      "requests_backfill"
    ]).queries(ctx => `
DELETE FROM ${ctx.resolve("all", "requests")}
WHERE date = '${date}';

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
  DATE('${date}') AS date,
  '${client}' AS client,
  pages.url AS page,
  TRUE AS is_root_page,
  pages.url AS root_page,
  requests.url AS url,
  requests.firstHTML AS is_main_document,
  get_type(requests.mimeType, get_ext_from_url(requests.url)) AS type,
  IF(requests.firstReq, 1, NULL) AS index,
  NULL AS payload,
  TO_JSON_STRING( STRUCT(
    requests.time AS time,
    requests.method AS method,
    requests.redirectUrl AS redirectUrl,
    requests.reqHttpVersion AS reqHttpVersion,
    requests.reqHeadersSize AS reqHeadersSize,
    requests.reqBodySize AS reqBodySize,
    requests.reqCookieLen AS reqCookieLen,
    requests.reqOtherHeaders AS reqOtherHeaders,
    requests.status AS status,
    requests.respHttpVersion AS respHttpVersion,
    requests.respHeadersSize AS respHeadersSize,
    requests.respBodySize AS respBodySize,
    requests.respSize AS respSize,
    requests.respCookieLen AS respCookieLen,
    requests.respOtherHeaders AS respOtherHeaders,
    requests.expAge AS expAge,
    requests.mimeType AS mimeType
    ${add_dimensions ? ",requests._cdn_provider AS _cdn_provider,requests._gzip_save AS _gzip_save" : ""}
  )) AS summary,
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
  ] AS request_headers,
  ARRAY<STRUCT<name string, value string>>[
    ("Accept-Ranges", requests.resp_accept_ranges),
    ("Age", requests.resp_age),
    ("Cache-Control", requests.resp_cache_control),
    ("Connection", requests.resp_connection),
    ("Content-Encoding", requests.resp_content_encoding),
    ("Content-Length", requests.resp_content_language),
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
  ] AS response_headers,
  NULL AS response_body
FROM summary_requests.${constants.fn_date_underscored(date)}_${client} AS requests ${constants.dev_TABLESAMPLE}
LEFT JOIN summary_pages.${constants.fn_date_underscored(date)}_${client} AS pages ${constants.dev_TABLESAMPLE}
USING(pageid);
    `)
  })
})