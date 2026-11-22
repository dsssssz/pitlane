/* v274: Telegram WebView (iOS) держит index.html в HTTP-кэше до 10 мин (GitHub Pages max-age=600).
         Сверяем версию с сервером без кэша; если вышла новая — один раз перезагружаемся на URL с ?v=, который кэш не знает. */
      (function () {
        var cur = document.querySelector('meta[name="pitlane-build"]').content;
        function check() {
          try {
            fetch('./version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
              if (!j || !j.v || j.v === cur) return;
              var k = 'pl-upd-' + j.v;
              if (sessionStorage.getItem(k)) return;
              sessionStorage.setItem(k, '1');
              var u = new URL(location.href); u.searchParams.set('v', j.v);
              location.replace(u.toString());
            }).catch(function () {});
          } catch (_) {}
        }
        check();
        document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
      })();
