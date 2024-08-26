declare({
    schema: "all",
    name: "pages"
});

declare({
    schema: "core_web_vitals",
    name: "technologies"
});

// Third party data
declare({
    database: "chrome-ux-report",
    schema: "materialized",
    name: "device_summary",
});
declare({
    database: "chrome-ux-report",
    schema: "materialized",
    name: "country_summary",
});
