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

iterations.forEach((iteration, i) => {
  operate(`backfill_requests ${iteration.date} ${iteration.client}`).tags([
    'backfill_requests'
  ]).dependencies([
    i === 0 ? 'backfill' : `backfill_requests ${iterations[i - 1].date} ${iterations[i - 1].client}`
  ]).queries(ctx => `
DELETE FROM crawl.requests
WHERE date = '${iteration.date}'
  AND client = '${iteration.client}';

CREATE TEMP FUNCTION getExtFromURL(url STRING)
RETURNS STRING
LANGUAGE js AS """
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

CREATE TEMP FUNCTION prettyType(mimeTyp STRING, ext STRING)
RETURNS STRING
LANGUAGE js AS """
try {
  mimeTyp = mimeTyp.toLowerCase();

  // Order by most unique first.
  // Do NOT do html because "text/html" is often misused for other types. We catch it below.
  const types = ["font", "css", "image", "script", "video", "audio", "xml"];
  for (const typ of types) {
    if (mimeTyp.includes(typ)) {
      return typ;
    }
  }

  // Special cases found manually
  if (ext === "js") {
    return "script";
  } else if (mimeTyp.includes("json") || ext === "json") {
    return "json";
  } else if (["eot", "ttf", "woff", "woff2", "otf"].includes(ext)) {
    return "font";
  } else if (["png", "gif", "jpg", "jpeg", "webp", "ico", "svg", "avif", "jxl", "heic", "heif"].includes(ext)) {
    return "image";
  } else if (ext === "css") {
    return "css";
  } else if (ext === "xml") {
    return "xml";
  } else if (
    ["flash", "webm", "mp4", "flv"].some((typ) => mimeTyp.includes(typ)) ||
    ["mp4", "webm", "ts", "m4v", "m4s", "mov", "ogv", "swf", "f4v", "flv"].includes(ext)
  ) {
    return "video";
  } else if (mimeTyp.includes("wasm") || ext === "wasm") {
    return "wasm";
  } else if (mimeTyp.includes("html") || ["html", "htm"].includes(ext)) {
    return "html"; // Catch "text/html" mime type
  } else if (mimeTyp.includes("text")) {
    return "text"; // Put "text" LAST because it's often misused, so ext should take precedence
  } else {
    return "other";
  }
} catch (e) {
  return "other"; // Return "other" if there's any error
}
""";

CREATE TEMP FUNCTION getFormat(prettyTyp STRING, mimeTyp STRING, ext STRING)
RETURNS STRING
LANGUAGE js AS """
try {
  if (prettyTyp === "image") {
      // Order by most popular first.
      const imageTypes = ["jpg", "png", "gif", "webp", "svg", "ico", "avif", "jxl", "heic", "heif"];
      for (const typ of imageTypes) {
          if (mimeTyp.includes(typ) || typ === ext) {
              return typ;
          }
      }
      if (mimeTyp.includes("jpeg")) {
          return "jpg";
      }
  }

  if (prettyTyp === "video") {
      // Order by most popular first.
      const videoTypes = ["flash", "swf", "mp4", "flv", "f4v"];
      for (const typ of videoTypes) {
          if (mimeTyp.includes(typ) || typ === ext) {
              return typ;
          }
      }
  }

  return "";
} catch (e) {
  return "";
}
""";

CREATE TEMP FUNCTION parseHeaders(headers JSON)
RETURNS ARRAY<STRUCT<name STRING, value STRING>>
LANGUAGE js AS """
  try {
    return headers.map(header => {
      return { name: header.name.toLowerCase(), value: header.value };
    });
  } catch (e) {
    return [];
  }
""";

CREATE TEMP FUNCTION getCookieLen(headers JSON, cookieName STRING)
RETURNS INT64
LANGUAGE js AS """
  try {
    const cookies = headers.filter(header => header.name.toLowerCase() === headerName)
    if (!cookies) {
      return 0
    } else if (Array.isArray(cookies)) {
      return cookies.values().reduce((acc, cookie) => acc + cookie.value.length, 0)
    } else {
      return 0
    }
  } catch (e) {
    return 0; // Return 0 in case of any errors
  }
""";

CREATE TEMP FUNCTION getExpAge(startedDateTime STRING, responseHeaders JSON)
RETURNS INT64
LANGUAGE js AS """
  try {
    const cacheControlRegExp = /max-age=(\\\\d+)/

    // Get the Cache-Control header value
    const cacheControl = responseHeaders.find(header => header.name.toLowerCase() === 'cache-control')?.value

    // Handle no-cache scenarios
    if (cacheControl && (cacheControl.includes('must-revalidate') || cacheControl.includes('no-cache') || cacheControl.includes('no-store'))) {
      return 0
    } else if (cacheControl && cacheControlRegExp.test(cacheControl)) { // Handle max-age directive in Cache-Control header
      const maxAgeValue = parseInt(cacheControlRegExp.exec(cacheControl)[1])
      return Math.min(2 ** 63 - 1, maxAgeValue)
    } else if ( // Handle Expires header in the response
      responseHeaders.find(header => header.name.toLowerCase() === 'expires')
    ) {
      const respDate = responseHeaders.find(header => header.name.toLowerCase() === 'date')?.value
      const startDate = new Date(respDate)?.getTime() || Date.parse(startedDateTime)

      const expDate = responseHeaders.find(header => header.name.toLowerCase() === 'expires')?.value
      const endDate = new Date(expDate)?.getTime() || 0

      return Math.max((endDate - startDate) / 1000, 0)
    }

    return 0
  } catch (e) {
    return 0 // Return 0 in case of any errors
  }
""";

INSERT INTO crawl.requests
SELECT
  DATE('${iteration.date}') AS date,
  '${iteration.client}' AS client,
  requests.page AS page,
  TRUE AS is_root_page,
  requests.page AS root_page,
  COALESCE(
    crux.rank,
    CASE
      WHEN summary_pages.rank <= 1000 THEN 1000
      WHEN summary_pages.rank <= 5000 THEN 5000
      ELSE NULL
    END
  ) AS rank,
  requests.url AS url,
  IF(
    STRING(payload._request_type) = "Document" AND
      MIN(index) OVER (PARTITION BY requests.page) = index,
    TRUE,
    FALSE
  ) AS is_main_document,
  type,
  index,
  payload,
  TO_JSON( STRUCT(
    payload.time,
    payload._method AS method,
    response.url AS redirectUrl,
    IFNULL(STRING(payload._protocol), STRING(request.httpVersion)) AS reqHttpVersion,
    request.headersSize AS reqHeadersSize,
    request.bodySize AS reqBodySize,
    getCookieLen(request.headers, 'cookie') AS reqCookieLen,
    response.status,
    response.httpVersion AS respHttpVersion,
    response.headersSize AS respHeadersSize,
    response.bodySize AS respBodySize,
    response.content.size AS respSize,
    getCookieLen(response.headers, 'set-cookie') AS respCookieLen,
    getExpAge(STRING(payload.startedDateTime), response.headers) AS expAge,
    response.content.mimeType,
    payload._cdn_provider,
    payload._gzip_save,
    ext,
    getFormat(type, STRING(response.content.mimeType), ext) AS format
  )) AS summary,
  parseHeaders(request.headers) AS request_headers,
  parseHeaders(response.headers) AS response_headers,
  IF(requests.type = 'image', NULL, response_bodies.body) AS response_body
FROM (
  FROM \`requests.${constants.fnDateUnderscored(iteration.date)}_${iteration.client}\` ${constants.devTABLESAMPLE}
  |> SET payload = SAFE.PARSE_JSON(payload, wide_number_mode => 'round')
  |> EXTEND getExtFromURL(url) AS ext
  |> EXTEND prettyType(STRING(payload.response.content.mimeType), ext) AS type
  |> EXTEND INT64(payload._index) AS index
  |> EXTEND payload.request AS request
  |> EXTEND payload.response AS response
  |> SET payload = JSON_REMOVE(
      payload,
      '$._headers',
      '$.request.headers',
      '$.response.headers'
    )
) AS requests

LEFT JOIN (
  SELECT DISTINCT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.resolve('chrome-ux-report', 'experimental', 'global')}
  WHERE yyyymm = ${constants.fnPastMonth(iteration.date).substring(0, 7).replace('-', '')}
) AS crux
ON requests.page = crux.page

LEFT JOIN summary_pages.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} AS summary_pages ${constants.devTABLESAMPLE}
ON requests.page = summary_pages.url

LEFT JOIN response_bodies.${constants.fnDateUnderscored(iteration.date)}_${iteration.client} AS response_bodies ${constants.devTABLESAMPLE}
ON requests.page = response_bodies.page
  AND requests.url = response_bodies.url;
  `)
})
