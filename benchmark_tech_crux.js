const lighthouse = {
  categories: {
    perf: {
      auditRefs: [
        { id: 'a1', group: 'metrics' },
        { id: 'a2', group: 'hidden' },
        { id: 'a3', group: 'perf' },
        { id: 'a4', group: 'perf' },
      ]
    },
    seo: {
      auditRefs: [
        { id: 'a5', group: 'seo' },
        { id: 'a6', group: 'hidden' },
      ]
    }
  },
  audits: {
    a1: { score: 1 },
    a2: { score: 1 },
    a3: { score: 1 },
    a4: { score: 0 },
    a5: { score: 1 },
    a6: { score: 1 }
  }
};

function get_passed_audits_baseline(lighthouse) {
  const results = []

  for (const category of Object.keys(lighthouse?.categories ? lighthouse.categories : {})) {
    for (const audit of lighthouse.categories[category].auditRefs) {
      if (
        lighthouse.audits[audit.id].score === 1 // Only include audits that passed
          && !['metrics', 'hidden'].includes(audit.group) // Exclude metrics and hidden audits
      ) {
        results.push({
          category,
          id: audit.id
        });
      }
    }
  }

  return results;
}

function get_passed_audits_optimized_for_in(lighthouse) {
  const results = [];
  const categories = lighthouse?.categories;
  if (!categories) return results;

  const audits = lighthouse?.audits;
  if (!audits) return results;

  for (const category in categories) {
    const auditRefs = categories[category].auditRefs;
    if (!auditRefs) continue;

    for (let i = 0; i < auditRefs.length; i++) {
      const audit = auditRefs[i];
      const group = audit.group;

      if (group === 'metrics' || group === 'hidden') continue;

      const auditData = audits[audit.id];
      if (auditData && auditData.score === 1) {
        results.push({
          category,
          id: audit.id
        });
      }
    }
  }

  return results;
}

// Warmup
for (let i = 0; i < 10000; i++) {
  get_passed_audits_baseline(lighthouse);
  get_passed_audits_optimized_for_in(lighthouse);
}

const ITERATIONS = 1000000;
const t1 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  get_passed_audits_baseline(lighthouse);
}
const t2 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  get_passed_audits_optimized_for_in(lighthouse);
}
const t3 = performance.now();

console.log('Baseline:', t2 - t1, 'ms');
console.log('Optimized for-in:', t3 - t2, 'ms', 'Imp:', (((t2 - t1) - (t3 - t2)) / (t2 - t1) * 100).toFixed(2), '%');
