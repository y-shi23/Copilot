// @ts-nocheck
(() => {
  if (window.location.search.indexOf('dark=1') === -1) {
    return;
  }

  document.documentElement.classList.add('dark');

  const darkColor = '#1d1f22';
  document.documentElement.style.backgroundColor = darkColor;
  if (document.body) {
    document.body.style.backgroundColor = darkColor;
  }

  const style = document.createElement('style');
  style.innerHTML = `html, body { background-color: ${darkColor} !important; }`;
  document.head.appendChild(style);
})();
