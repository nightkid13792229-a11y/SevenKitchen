/* 原型导航：hash 路由 + data-go 切屏 */
(function () {
  function screens() {
    return Array.from(document.querySelectorAll('.screen'));
  }

  function activate(id) {
    var list = screens();
    if (!list.length) return;
    var target = document.getElementById(id) || list[0];
    list.forEach(function (el) {
      el.classList.toggle('active', el === target);
    });
    document.querySelectorAll('.proto-bar button').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-go') === target.id);
    });
    if (history.replaceState) {
      history.replaceState(null, '', '#' + target.id);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  document.addEventListener('click', function (event) {
    var go = event.target.closest('[data-go]');
    if (go) {
      event.preventDefault();
      activate(go.getAttribute('data-go'));
      return;
    }
    var print = event.target.closest('[data-print]');
    if (print) {
      event.preventDefault();
      window.print();
    }
  });

  window.addEventListener('hashchange', function () {
    var id = location.hash.replace('#', '');
    if (id) activate(id);
  });

  document.addEventListener('DOMContentLoaded', function () {
    var id = location.hash.replace('#', '');
    activate(id || (screens()[0] && screens()[0].id));
  });
})();
