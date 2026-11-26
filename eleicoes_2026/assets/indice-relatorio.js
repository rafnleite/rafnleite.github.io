function acompanharIndiceDoRelatorio() {
  const links = new Map(
    Array.from(document.querySelectorAll('.sidebar nav a[href^="#"]'), link => [link.hash.slice(1), link])
  );
  const secoes = Array.from(document.querySelectorAll('main > section[id], main > footer[id]'))
    .filter(secao => links.has(secao.id));
  if (!secoes.length) return;

  let atual;
  function destacarSecao() {
    const pagina = document.scrollingElement;
    const noFim = pagina.scrollTop > 0 && pagina.scrollTop + pagina.clientHeight >= pagina.scrollHeight - 2;
    let secao = secoes[0];
    if (noFim) {
      secao = secoes[secoes.length - 1];
    } else {
      for (const candidata of secoes) {
        if (candidata.getBoundingClientRect().top >= 150) break;
        secao = candidata;
      }
    }

    const proximo = links.get(secao.id);
    if (atual === proximo) return;
    if (atual) {
      atual.classList.remove('active');
      atual.removeAttribute('aria-current');
    }
    proximo.classList.add('active');
    proximo.setAttribute('aria-current', 'location');
    atual = proximo;
  }

  document.addEventListener('scroll', destacarSecao, { passive: true });
  window.addEventListener('pageshow', destacarSecao);
  window.addEventListener('resize', destacarSecao);
  destacarSecao();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', acompanharIndiceDoRelatorio, { once: true });
} else {
  acompanharIndiceDoRelatorio();
}
