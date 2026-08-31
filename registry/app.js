// ICAM Founder Panel — Registry UI scaffold
// Intentionally presentation-only. No authority logic, writes, approvals,
// Continuity semantics, registry truth mutations, or real backend calls live here.

const rows = document.querySelectorAll('.registry-table tbody tr');
rows.forEach(row => {
  row.addEventListener('click', () => {
    rows.forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
  });
});

document.querySelectorAll('button, .nav a').forEach(el => {
  el.addEventListener('click', event => {
    if (el.tagName === 'A') event.preventDefault();
  });
});
