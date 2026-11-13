/* Parser-blocking, same-origin bootstrap: apply route classes before body paint. */
(() => {
  const root=document.documentElement;
  root.classList.toggle('fde-signin',location.pathname.startsWith('/signin'));
  root.classList.toggle('fde-account',location.pathname.startsWith('/account'));
  if (/^\/(agent|chat|chatbot)\//.test(location.pathname)) {
    root.classList.add('rx-webapp');
    const theme = document.createElement('link');
    theme.rel = 'stylesheet'; theme.href = '/new-ui/webapp-theme.css?v=20261108-5';
    document.head.appendChild(theme);
    const script = document.createElement('script');
    script.src = '/new-ui/webapp-theme.js?v=20261108-5'; script.defer = true;
    document.head.appendChild(script);
  }
})();
