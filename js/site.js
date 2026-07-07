// 열공메이트 웹사이트 공용 스크립트
(function () {
  'use strict';

  // 모바일 네비 햄버거 토글
  var navToggle = document.querySelector('.nav-toggle');
  var navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { navLinks.classList.remove('open'); });
    });
  }

  // 플랫폼 토글 (iOS / Android 스크린샷·기능 전환)
  document.querySelectorAll('[data-ptoggle]').forEach(function (group) {
    var buttons = group.querySelectorAll('button[data-plat]');
    var scope = document.querySelector(group.getAttribute('data-ptoggle')) || document;
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var plat = btn.getAttribute('data-plat');
        buttons.forEach(function (b) { b.classList.toggle('on', b === btn); });
        scope.querySelectorAll('[data-panel]').forEach(function (panel) {
          panel.hidden = panel.getAttribute('data-panel') !== plat;
        });
      });
    });
  });

  // 스크롤 등장 애니메이션
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // 현재 연도
  var y = document.querySelector('[data-year]');
  if (y) y.textContent = new Date().getFullYear();
})();
