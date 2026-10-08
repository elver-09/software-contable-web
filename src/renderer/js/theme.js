// Theme bootstrap kept in an external file so the renderer can use a strict
// Content-Security-Policy without allowing inline scripts.
(function () {
  let btn = null;

  function aplicarTema(dark) {
    if (dark) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('sc_theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('sc_theme', 'light');
    }
    if (btn) {
      btn.innerHTML = dark
        ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
      const label = dark ? 'Activar tema claro' : 'Activar tema oscuro';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }

  const saved = localStorage.getItem('sc_theme');
  if (saved === 'dark' && document.body) document.body.classList.add('dark-mode');

  document.addEventListener('DOMContentLoaded', function () {
    btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    aplicarTema(localStorage.getItem('sc_theme') === 'dark');
    btn.addEventListener('click', function () {
      aplicarTema(!document.body.classList.contains('dark-mode'));
    });
  });
})();
