const staging_tables = ["pages", "requests", "parsed_css"]
for (const table of staging_tables) {
    declare({
        schema: "crawl_staging",
        name: table,
    });
}

const crux_tables = ["country_summary", "device_summary"];
for (const table of crux_tables) {
    declare({
        database: "chrome-ux-report",
        schema: "materialized",
        name: table,
    });
}

assert(
    "device_summary_not_empty"
).query(
    ctx => `
    SELECT 
        'No data for the specified date' AS error_message
    FROM ${ctx.ref("chrome-ux-report", "materialized", "device_summary")}
    WHERE yyyymm = 202407
    GROUP BY yyyymm
    HAVING COUNT(1) = 0
`);

assert(
    "country_summary_not_empty"
).query(
    ctx => `
    SELECT 
        'No data for the specified date' AS error_message
    FROM ${ctx.ref("chrome-ux-report", "materialized", "country_summary")}
    WHERE yyyymm = 202407
    GROUP BY yyyymm
    HAVING COUNT(1) = 0
`);
