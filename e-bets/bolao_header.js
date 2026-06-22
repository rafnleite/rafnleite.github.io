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
  z-index:200;\
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
/* ── Hamburger button (mobile only) ── */\
.mob-menu-btn{\
  display:none;\
  align-items:center;\
  justify-content:center;\
  width:48px;\
  background:none;\
  border:none;\
  border-left:1px solid var(--border);\
  cursor:pointer;\
  color:var(--sub);\
  flex-shrink:0;\
  transition:background .12s;\
}\
.mob-menu-btn:hover{background:var(--bg);}\
/* ── Dropdown panel (mobile only) ── */\
.mob-nav-panel{\
  display:none;\
  position:absolute;\
  top:100%;\
  left:0;\
  right:0;\
  background:var(--white);\
  border-bottom:1px solid var(--border);\
  box-shadow:0 6px 20px rgba(0,0,0,.1);\
  flex-direction:column;\
  z-index:199;\
}\
.mob-nav-panel.open{display:flex;}\
.mob-nav-panel .nav-link{\
  border-left:none;\
  border-top:1px solid var(--border);\
  padding:14px 20px;\
  font-size:0.72rem;\
  letter-spacing:1.4px;\
}\
.mob-nav-panel .nav-link.active::after{\
  top:0;bottom:0;right:auto;\
  width:3px;height:auto;\
}\
@media(min-width:641px){\
  .mob-menu-btn{display:none!important;}\
  .mob-nav-panel{display:none!important;}\
}\
@media(max-width:640px){\
  .page-header{min-height:48px;position:relative;}\
  .logo-title{padding:8px 14px;}\
  .logo-title h1{font-size:1.05rem;letter-spacing:2px;}\
  .logo-title p{display:none;}\
  .header-nav{display:none;}\
  .mob-menu-btn{display:flex;}\
}\
';

  var PAGES = [
    { id: 'ebets',         label: 'e-B\u00c9TS',        href: 'https://oracleapex.com/ords/r/ebets/copadomundo', external: true },
    { id: 'ranking',       label: 'Ranking',        href: 'bolao_ranking.html' },
    { id: 'apostas',       label: 'Apostas',        href: 'bolao_apostas.html' },
    { id: 'participante',  label: 'Participantes',  href: 'bolao_participante.html' },
    { id: 'selecoes',      label: 'Sele\u00e7\u00f5es',       href: 'bolao_ranking_selecoes.html' },
    { id: 'consenso',      label: 'Consenso',       href: 'bolao_ranking_consenso.html' }
  ];

  function injectHeader(currentPage, subtitle) {
    var faviconHref = 'favicon.ico';
    var favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = faviconHref;

    if (!document.getElementById('_bolao_hdr_css')) {
      var s = document.createElement('style');
      s.id = '_bolao_hdr_css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    var navLinks = PAGES.map(function (p) {
      var cls = 'nav-link' + (p.id === currentPage ? ' active' : '');
      var extra = p.external ? ' target="_blank" rel="noopener"' : '';
      return '<a class="' + cls + '" href="' + p.href + '"' + extra + '>' + p.label + '</a>';
    }).join('');

    var hamburgerSVG =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
        '<line x1="3" y1="6"  x2="21" y2="6"/>' +
        '<line x1="3" y1="12" x2="21" y2="12"/>' +
        '<line x1="3" y1="18" x2="21" y2="18"/>' +
      '</svg>';

    var closeSVG =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
        '<line x1="18" y1="6"  x2="6"  y2="18"/>' +
        '<line x1="6"  y1="6"  x2="18" y2="18"/>' +
      '</svg>';

    var html =
      '<header class="page-header" id="_bolao_header">' +
        '<div class="logo-title">' +
          '<h1>Bol\u00e3o Copa 2026</h1>' +
          (subtitle ? '<p>' + subtitle + '</p>' : '') +
        '</div>' +
        '<nav class="header-nav">' + navLinks + '</nav>' +
        '<button class="mob-menu-btn" id="_mob_menu_btn" aria-label="Menu" aria-expanded="false">' +
          hamburgerSVG +
        '</button>' +
        '<nav class="mob-nav-panel" id="_mob_nav_panel">' + navLinks + '</nav>' +
      '</header>';

    var mount = document.getElementById('site-header');
    if (mount) mount.outerHTML = html;

    // Wire up toggle
    var btn   = document.getElementById('_mob_menu_btn');
    var panel = document.getElementById('_mob_nav_panel');
    if (btn && panel) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = panel.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
        btn.innerHTML = open ? closeSVG : hamburgerSVG;
      });
      // Close when a link is tapped
      panel.addEventListener('click', function (e) {
        var link = e.target.closest ? e.target.closest('.nav-link') : null;
        if (link) {
          panel.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
          btn.innerHTML = hamburgerSVG;
        }
      });
      // Close when tapping outside
      document.addEventListener('click', function (e) {
        if (!panel.classList.contains('open')) return;
        var header = document.getElementById('_bolao_header');
        if (header && !header.contains(e.target)) {
          panel.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
          btn.innerHTML = hamburgerSVG;
        }
      });
    }
  }

  window.injectHeader = injectHeader;

}());
