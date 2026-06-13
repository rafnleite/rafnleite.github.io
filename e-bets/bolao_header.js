/* ── Shared page header ──────────────────────────────────────────────────────
   Usage in each page:
     1. <script src="bolao_header.js"></script>  (in <head>)
     2. <div id="site-header"></div>             (first element of <body>)
     3. <script>injectHeader('apostas','Apostas por jogo');</script>
   Page IDs: 'apostas' | 'selecoes' | 'consenso' | 'ranking'
*/
(function () {

  var CSS = '\
.page-header{\
  background:var(--white);\
  border-bottom:1px solid var(--border);\
  display:flex;\
  align-items:stretch;\
  justify-content:space-between;\
  position:sticky;\
  top:0;\
  z-index:100;\
  box-shadow:0 1px 6px rgba(0,0,0,.07);\
  min-height:54px;\
}\
.logo-title{\
  display:flex;\
  flex-direction:column;\
  justify-content:center;\
  padding:10px 24px;\
  gap:3px;\
}\
.logo-title h1{\
  font-family:"Bebas Neue",cursive;\
  font-size:1.25rem;\
  letter-spacing:3px;\
  color:var(--accent);\
  line-height:1;\
}\
.logo-title p{\
  font-size:0.58rem;\
  font-weight:700;\
  letter-spacing:2.2px;\
  text-transform:uppercase;\
  color:var(--sub);\
  line-height:1;\
}\
.header-nav{\
  display:flex;\
  align-items:stretch;\
  flex-shrink:0;\
}\
.nav-link{\
  display:flex;\
  align-items:center;\
  padding:0 22px;\
  font-family:"Inter",sans-serif;\
  font-size:0.67rem;\
  font-weight:700;\
  letter-spacing:1.3px;\
  text-transform:uppercase;\
  color:var(--sub);\
  text-decoration:none;\
  border-left:1px solid var(--border);\
  transition:color 0.12s,background 0.12s;\
  white-space:nowrap;\
  position:relative;\
}\
.nav-link:hover{\
  color:var(--text);\
  background:var(--bg);\
}\
.nav-link.active{\
  color:var(--accent);\
  pointer-events:none;\
}\
.nav-link.active::after{\
  content:"";\
  position:absolute;\
  bottom:0;\
  left:0;\
  right:0;\
  height:2px;\
  background:var(--accent);\
}\
';

  var PAGES = [
    { id: 'ranking',       label: 'Ranking',        href: 'bolao_ranking.html' },
    { id: 'apostas',       label: 'Apostas',        href: 'bolao_apostas.html' },
    { id: 'participante',  label: 'Participantes',  href: 'bolao_participante.html' },
    { id: 'selecoes',      label: 'Seleções',       href: 'bolao_ranking_selecoes.html' },
    { id: 'consenso',      label: 'Consenso',       href: 'bolao_ranking_consenso.html' }
  ];

  function injectHeader(currentPage, subtitle) {
    if (!document.getElementById('_bolao_hdr_css')) {
      var s = document.createElement('style');
      s.id = '_bolao_hdr_css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    var nav = PAGES.map(function (p) {
      var cls = 'nav-link' + (p.id === currentPage ? ' active' : '');
      return '<a class="' + cls + '" href="' + p.href + '">' + p.label + '</a>';
    }).join('');

    var html =
      '<header class="page-header">' +
        '<div class="logo-title">' +
          '<h1>Bol\u00e3o Copa 2026</h1>' +
          (subtitle ? '<p>' + subtitle + '</p>' : '') +
        '</div>' +
        '<nav class="header-nav">' + nav + '</nav>' +
      '</header>';

    var mount = document.getElementById('site-header');
    if (mount) mount.outerHTML = html;
  }

  window.injectHeader = injectHeader;

}());
