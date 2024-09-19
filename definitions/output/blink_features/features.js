
publish("features", {
  schema: "blink_features",
  type: "incremental",
  protected: true,
  bigquery: {
    partitionBy: "yyyymmdd",
    clusterBy: ["client", "rank"]
  },
  tags: ["blink_features_report"]
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE yyyymmdd = DATE '${constants.current_month}';

CREATE TEMP FUNCTION features(payload STRING)
RETURNS ARRAY<STRUCT<id STRING, name STRING, type STRING>> LANGUAGE js AS
"""
function getFeatureNames(featureMap, featureType) {
  try {
    return Object.entries(featureMap).map(([key, value]) => {
      // After Feb 2020 keys are feature IDs.
      if (value.name) {
        return {'name': value.name, 'type': featureType, 'id': key};
      }
      // Prior to Feb 2020 keys fell back to IDs if the name was unknown.
      if (idPattern.test(key)) {
        return {'name': '', 'type': featureType, 'id': key.match(idPattern)[1]};
      }
      // Prior to Feb 2020 keys were names by default.
      return {'name': key, 'type': featureType, 'id': ''};
    });
  } catch (e) {
    return [];
  }
}

var $ = JSON.parse(payload);
if (!$._blinkFeatureFirstUsed) return [];

var idPattern = new RegExp('^Feature_(\d+)$');
return getFeatureNames($._blinkFeatureFirstUsed.Features, 'default')
  .concat(getFeatureNames($._blinkFeatureFirstUsed.CSSFeatures, 'css'))
  .concat(getFeatureNames($._blinkFeatureFirstUsed.AnimatedCSSFeatures, 'animated-css'));
""";
`).query(ctx => `
SELECT
  date AS yyyymmdd,
  client,
  url,
  feature.feature AS feature,
  feature.type,
  feature.id,
  rank
FROM (
  SELECT
    date,
    client,
    page AS url,
    payload,
    rank,
    feature
  FROM ${ctx.ref("all", "pages")},
    UNNEST(features) AS feature
  WHERE
    date = '${constants.current_month}' AND
    is_root_page = TRUE ${constants.dev_rank5000_filter}
)
`)
