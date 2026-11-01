// eco/foodWebIndex.js
//
// A conceptual, non-validated indicator derived only from authority field-inspection
// checkboxes. It exists to give a rough at-a-glance sense of accumulated stress signals
// over time for a water body — it is explicitly NOT a scientifically validated ecological
// index, and every place it's shown must carry that disclaimer.
const WEIGHTS = {
  visible_pollution: 15,
  sewage_inflow: 15,
  solid_waste: 10,
  aquatic_vegetation: 8,
  fish_mortality_observed: 20,
  invasive_plants_observed: 12,
  biodiversity_reduced_observed: 15,
  habitat_disturbance_observed: 10,
};

function labelFor(score) {
  if (score >= 80) return 'Few observed stress indicators';
  if (score >= 60) return 'Moderate observed stress indicators';
  if (score >= 40) return 'Significant observed stress indicators';
  return 'Severe observed stress indicators';
}

function computeFoodWebIndex(inspections) {
  if (!inspections || inspections.length === 0) return null;
  const perInspectionScores = inspections.map((i) => {
    let score = 100;
    for (const [key, weight] of Object.entries(WEIGHTS)) {
      if (i[key]) score -= weight;
    }
    return Math.max(0, score);
  });
  const avg = Math.round(perInspectionScores.reduce((a, b) => a + b, 0) / perInspectionScores.length);
  return {
    score: avg,
    label: labelFor(avg),
    basis: inspections.length,
    disclaimer: 'Conceptual indicator derived only from field-inspection checklist data. Not a validated ecological or scientific index — does not replace laboratory or expert ecological assessment.',
  };
}

module.exports = { computeFoodWebIndex };
