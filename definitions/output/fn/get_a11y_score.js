operate('get_a11y_score').tags(['functions']).queries(`
CREATE OR REPLACE FUNCTION \`httparchive.fn.getA11yScore\`(reportCategories JSON)
RETURNS FLOAT64 DETERMINISTIC
LANGUAGE js AS """
if(reportCategories) {
    return reportCategories.find(i => i.name === 'Accessibility').score;
}
""";
`)
