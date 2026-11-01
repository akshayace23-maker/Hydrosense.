// pdf/generate.js
const PDFDocument = require('pdfkit');

function statusLabel(s) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function header(doc, title, subtitle) {
  doc.fillColor('#0e8388').fontSize(20).text('HydroSense', { continued: false });
  doc.fillColor('#0b2036').fontSize(16).text(title, { paragraphGap: 2 });
  if (subtitle) doc.fillColor('#45607a').fontSize(10).text(subtitle);
  doc.moveDown();
  doc.strokeColor('#d7e3ea').moveTo(doc.x, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.fillColor('#0b2036');
}

function sectionTitle(doc, text) {
  doc.moveDown(0.6);
  doc.fillColor('#0e8388').fontSize(12).text(text.toUpperCase());
  doc.fillColor('#0b2036').fontSize(10);
}

// Single report "case report" PDF for authorities/printing.
function reportCasePdf({ res, report, photos, timeline, inspections, actions, confirmCount }) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${report.report_code}.pdf"`);
  doc.pipe(res);

  header(doc, `Case Report — ${report.report_code}`, `Generated ${new Date().toLocaleString()}`);

  doc.fontSize(10);
  doc.text(`Water body: ${report.water_body_name || report.water_body_name_raw || 'Unnamed'} (${statusLabel(report.water_body_type)})`);
  doc.text(`Status: ${statusLabel(report.status)}   Priority: ${statusLabel(report.priority)}`);
  doc.text(`Location: ${report.address || '—'}${report.lat ? `  (${report.lat.toFixed(5)}, ${report.lng.toFixed(5)})` : ''}`);
  doc.text(`Reported: ${report.created_at}   Anonymous: ${report.is_anonymous ? 'Yes' : 'No'}`);
  doc.text(`Community confirmations: ${confirmCount}`);

  sectionTitle(doc, 'Citizen observation');
  doc.text(`Observed issues: ${JSON.parse(report.observed_issues || '[]').map(statusLabel).join(', ') || 'None selected'}`);
  if (report.additional_notes) doc.text(`Notes: ${report.additional_notes}`);

  if (report.ai_relevance && report.ai_relevance !== 'unchecked') {
    sectionTitle(doc, 'AI-assisted photo check (advisory only)');
    doc.text(`Relevance: ${statusLabel(report.ai_relevance)}`);
    doc.text(`Possible visible indicators: ${JSON.parse(report.ai_indicators || '[]').map(statusLabel).join(', ') || 'None flagged'}`);
    doc.text('Note: AI output is assistive only and does not constitute official verification.');
  }

  sectionTitle(doc, `Photo evidence (${photos.length})`);
  doc.text(photos.length ? photos.map((p) => `- ${p.stage} (${p.created_at}${p.gps_source === 'exif' ? ', EXIF GPS available' : ''})`).join('\n') : 'No data available yet.');

  sectionTitle(doc, 'Field inspections');
  doc.text(inspections.length ? inspections.map((i) => `- ${i.inspection_date}: ${i.observed_condition || 'Recorded'}${i.recommended_intervention ? ` | Recommended: ${i.recommended_intervention}` : ''}`).join('\n') : 'No data available yet.');

  sectionTitle(doc, 'Actions taken');
  doc.text(actions.length ? actions.map((a) => `- ${a.action_date}: ${a.action_taken}`).join('\n') : 'No data available yet.');

  sectionTitle(doc, 'Status timeline');
  doc.text(timeline.map((t) => `- ${t.created_at} — ${statusLabel(t.status)}${t.remarks ? `: ${t.remarks}` : ''}`).join('\n'));

  doc.moveDown();
  doc.fontSize(8).fillColor('#45607a').text('This document reflects citizen observation, AI-assisted advisory checks, and authority-recorded inspections/actions as separate, clearly labeled categories of evidence.');

  doc.end();
}

// Water-body long-term history / environmental monitoring summary PDF.
function waterBodyHistoryPdf({ res, waterBody, stats, reports, inspections, actions, ecoIndex }) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="waterbody-${waterBody.id}-history.pdf"`);
  doc.pipe(res);

  header(doc, `Water-Body History — ${waterBody.name}`, `Generated ${new Date().toLocaleString()}`);
  doc.fontSize(10);
  doc.text(`Type: ${statusLabel(waterBody.type)}   Location: ${waterBody.address || '—'}`);
  doc.text(`Total reports: ${stats.total_reports}   Active: ${stats.active}   Resolved: ${stats.resolved}   Confirmations: ${stats.confirmations}`);

  if (ecoIndex) {
    sectionTitle(doc, 'Conceptual Food Web Resilience Index (not a validated scientific score)');
    doc.text(`Score: ${ecoIndex.score} / 100 (${ecoIndex.label})`);
    doc.text(`Based on ${ecoIndex.basis} field inspection(s). ${ecoIndex.disclaimer}`);
  }

  sectionTitle(doc, 'Report history');
  doc.text(reports.length ? reports.map((r) => `- ${r.report_code} (${r.created_at}) — ${statusLabel(r.status)}`).join('\n') : 'No data available yet.');

  sectionTitle(doc, 'Inspection history');
  doc.text(inspections.length ? inspections.map((i) => `- ${i.inspection_date}: ${i.observed_condition || 'Recorded'}`).join('\n') : 'No data available yet.');

  sectionTitle(doc, 'Restoration / action history');
  doc.text(actions.length ? actions.map((a) => `- ${a.action_date}: ${a.action_taken}`).join('\n') : 'No data available yet.');

  doc.end();
}

module.exports = { reportCasePdf, waterBodyHistoryPdf };
