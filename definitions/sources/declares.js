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
    "device_summary not empty"
).query(
    ctx => `
    SELECT 
        COUNT(0)
    FROM ${ctx.ref("chrome-ux-report", "materialized", "device_summary")}
    WHERE yyyymm = 202407
`);

declare({
    database: "chrome-ux-report",
    schema: "materialized",
    name: "country_summary",
});
assert(
    "country_summary not empty"
).query(
    ctx => `
    SELECT 
        COUNT(0)
    FROM ${ctx.ref("chrome-ux-report", "materialized", "country_summary")}
    WHERE yyyymm = 202407
`);