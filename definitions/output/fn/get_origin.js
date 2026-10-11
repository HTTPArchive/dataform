operate('get_origin').tags(['functions']).queries(`
CREATE OR REPLACE FUNCTION \`httparchive.fn.GET_ORIGIN\`(url STRING)
RETURNS STRING
AS (
LOWER(CONCAT(
    -- only network protocols (excludes blob, filesystem, chrome, etc)
    REGEXP_EXTRACT(url, r'(?i)^(https?://)'),
    NET.HOST(url),
    -- be lazy and include @ and : for username/password without enforcing order.
    IFNULL(REGEXP_EXTRACT(url, r'(?i)^https?://[\\w-.@:]+(:\\d+)'), '')
  ))
);
`)
