// src/renderer/js/router.js
export function initRouter(onViewChange) {
  document.querySelectorAll('.menu-btn').forEach(button => {
    button.addEventListener('click', () => {
      // Si el botón es un menú desplegable (tiene submenu)
      if (button.classList.contains('has-submenu')) {
        button.classList.toggle('expanded');
        const submenu = button.nextElementSibling;
        if (submenu && submenu.classList.contains('submenu')) {
          submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
        }
        return; // Detenemos aquí para no cambiar de vista
      }

      // Limpiar clases activas
      document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.submenu-item').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
      
      // Activar la vista seleccionada
      button.classList.add('active');
      const targetId = button.getAttribute('data-target');
      if (targetId) {
        document.getElementById(targetId).classList.add('active');
      }

      // Avisar si la vista cambió (para refrescar datos si es necesario)
      if (onViewChange) onViewChange(targetId);
    });
  });

  // Manejar clics en los elementos de los submenús
  document.querySelectorAll('.submenu-item').forEach(button => {
    button.addEventListener('click', () => {
      // Limpiar clases activas de todos los botones principales y submenús
      document.querySelectorAll('.menu-btn:not(.has-submenu)').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.submenu-item').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
      
      // Activar la vista seleccionada
      button.classList.add('active');
      const targetId = button.getAttribute('data-target');
      if (targetId) {
        document.getElementById(targetId).classList.add('active');
        if (onViewChange) onViewChange(targetId);
      }
    });
  });
}