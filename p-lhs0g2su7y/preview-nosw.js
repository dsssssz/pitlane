/* PREVIEW v346 (стекло): свой service worker не регистрируем, чтобы не трогать кэши основного сайта */
try { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, "register", { configurable: true, value: function () { return Promise.reject(new Error("preview: SW disabled")); } }); } catch (e) {}
