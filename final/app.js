// ICAM Founder Panel workbench — presentation only.
// No authority logic, writes, approvals, Continuity mutations, or backend semantics here.

const rows = document.querySelectorAll('.registry-table tbody tr');
rows.forEach(row => {
  row.addEventListener('click', () => {
    rows.forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
  });
});

document.querySelectorAll('button').forEach(el => {
  el.addEventListener('click', event => event.preventDefault());
});

document.querySelectorAll('.nav a').forEach(link => {
  const href = link.getAttribute('href');
  if (!href || href === '#') {
    link.addEventListener('click', event => event.preventDefault());
  }
});
