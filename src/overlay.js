(function () {
  'use strict';
  var overlay = document.getElementById('clone-overlay');
  var hud     = document.getElementById('clone-overlay-hud');
  var visible = false;
  var opacity = 0.5;

  function update() {
    overlay.style.display = visible ? 'block' : 'none';
    overlay.style.opacity = opacity;
    hud.textContent = '[O] overlay ' + (visible ? 'ON' : 'OFF') +
      (visible ? '  |  wheel = opacity (' + Math.round(opacity * 100) + '%)' : '');
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'o' || e.key === 'O') {
      visible = !visible;
      update();
    }
  });

  document.addEventListener('wheel', function (e) {
    if (!visible) return;
    opacity = Math.min(1, Math.max(0.05, opacity - e.deltaY * 0.001));
    update();
  }, { passive: true });

  window.addEventListener('scroll', function () {
    if (!visible) return;
    try {
      overlay.contentWindow.scrollTo(window.scrollX, window.scrollY);
    } catch (err) {
      // cross-origin scroll blocked — expected for external URLs
    }
  });

  update();
})();
