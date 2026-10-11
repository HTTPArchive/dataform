operate('get_lcp_lazy').tags(['functions']).queries(`
CREATE OR REPLACE FUNCTION \`httparchive.fn.GET_LCP_LAZY\`(performance_custom_metric STRING)
RETURNS STRUCT<native BOOL, custom ARRAY<STRING>>
LANGUAGE js AS """
try {
  const perf = JSON.parse(performance_custom_metric);
  const lcpAttrs = perf.lcp_elem_stats.attributes;

  const custom = [{
    name: 'data-src'
  }, {
    name: 'data-rimg'
  }, {
    name: 'data-lazy'
  }, {
    name: 'class',
    value: 'lazyload'
  }, {
    name: 'class',
    value: 'swiper-lazy'
  }];

  return {
    native: lcpAttrs.some(({name, value}) => {
      return name == 'loading' && value == 'lazy';
    }),
    custom: custom.filter(({name, value}) => {
      const valueRegex = new RegExp(\`(^|\\s)\${value}(\\s|$)\`);
      return lcpAttrs.some(attr => {
        return attr.name == name && (!value || valueRegex.test(attr.value));
      });
    }).map(({name, value}) => {
      return \`[\${name}\${value ? \`~=\${value}\` : ''}]\`;
    })
  }
} catch {
  return null;
}
""";
`)
