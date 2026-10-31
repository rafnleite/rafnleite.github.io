if(new URLSearchParams(location.search).get('incorporada')==='1')document.body.classList.add('report-embedded');
/** Navegação editorial compartilhada pelas páginas de análise. */
const sidebar = document.getElementById('reportSidebar');
const toggle = document.getElementById('reportIndexToggle');

if (sidebar && toggle) {
  const mobile = window.matchMedia('(max-width: 760px)');
  const setOpen = (open, {focus = false} = {}) => {
    const visible = Boolean(open && mobile.matches);
    document.body.classList.toggle('report-nav-open', visible);
    sidebar.classList.toggle('open', visible);
    toggle.setAttribute('aria-expanded', String(visible));
    toggle.textContent = visible ? 'Fechar índice ×' : 'Índice ☰';
    if (focus) toggle.focus({preventScroll: true});
  };
  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  sidebar.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('report-nav-open')) {
      setOpen(false, {focus: true});
    }
  });
  document.addEventListener('pointerdown', event => {
    if (document.body.classList.contains('report-nav-open') &&
        !sidebar.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  mobile.addEventListener('change', () => setOpen(false));
}
