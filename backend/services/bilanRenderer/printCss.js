// Feuille de style unique du bilan (aperçu écran et PDF). Aucun style inline ailleurs.
const PRINT_CSS = `
@page { size: A4; margin: 2cm; }
.bilan { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; }
.bilan-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #3899aa; padding-bottom: 6pt; margin-bottom: 10pt; }
.bilan-header-left { font-size: 10pt; line-height: 1.4; }
.bilan-header-name { font-weight: 700; font-size: 12pt; }
.bilan-header-right { text-align: right; font-size: 9.5pt; color: #555; }
.bilan-brand { font-weight: 700; color: #3899aa; }
.bilan-title { text-align: center; font-size: 14pt; font-weight: 700; letter-spacing: .04em; margin: 12pt 0 4pt; }
.bilan-patient { text-align: center; color: #444; font-size: 10.5pt; margin-bottom: 10pt; }
.bilan-h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: .06em; color: #3899aa; border-bottom: 1px solid #d9e2e5; padding-bottom: 2pt; margin: 14pt 0 6pt; break-after: avoid; }
.bilan-section p { margin: 0 0 6pt; text-align: justify; }
.bilan-cat { font-size: 10.5pt; font-weight: 700; margin: 8pt 0 3pt; break-after: avoid; }
.bilan-table { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 0 0 8pt; break-inside: avoid; }
.bilan-table th, .bilan-table td { border: 1px solid #cfd8db; padding: 3pt 6pt; text-align: left; vertical-align: top; }
.bilan-table th { background: #eef5f7; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.bilan-table thead { display: table-header-group; }
.bilan-side { width: 14%; text-align: center; }
.bilan-val { text-align: center; font-variant-numeric: tabular-nums; }
.bilan-sign { margin-top: 24pt; text-align: right; font-size: 10pt; }
.bilan-legacy u { text-decoration: underline; font-weight: 600; }
.bilan-legacy table { border-collapse: collapse; width: 100%; }
.bilan-legacy th, .bilan-legacy td { border: 1px solid #999; padding: 3pt 6pt; }
`;

module.exports = { PRINT_CSS };
