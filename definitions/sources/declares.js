declare({
    schema: "all",
    name: "pages"
});

// Third party data
declare({
    database: "chrome-ux-report",
    schema: "materialized",
    name: "device_summary",
});
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

declare({
    database: "chrome-ux-report",
    schema: "materialized",
    name: "country_summary",
});
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