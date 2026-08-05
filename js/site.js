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

  // ── 도움말 검색 (help.html) ──────────────────
  // 서버 없이 페이지 안의 항목만 걸러낸다. 비교 전에 공백을 없애므로
  // '시간수정'으로 검색해도 '시간 수정'이 걸린다 (한국어 검색어는 띄어쓰기가 제각각).
  var hSearch = document.querySelector('[data-help-search]');
  if (hSearch) {
    var hItems = [].slice.call(document.querySelectorAll('.hitem'));
    var hResults = document.querySelector('[data-help-results]');
    var hGroups = [].slice.call(document.querySelectorAll('.hgroup')).filter(function (g) {
      return g !== hResults;
    });
    var hCats = [].slice.call(document.querySelectorAll('.hcat'));
    var hCount = document.querySelector('[data-help-count]');
    var hEmpty = document.querySelector('[data-help-empty]');
    var hClear = document.querySelector('[data-help-clear]');
    var curCat = 'all';

    var norm = function (s) { return (s || '').toLowerCase().replace(/\s+/g, ''); };

    // 항목별 검색 대상 텍스트를 미리 만들어 둔다 (제목 + 본문 + 별칭 키워드)
    // _home: 검색이 끝나면 돌아갈 원래 분류. hItems가 문서 순서라 순서대로 다시 붙이면 원래 배열이 된다
    hItems.forEach(function (item) {
      var sum = item.querySelector('summary');
      item._title = norm(sum ? sum.textContent : '');
      item._keys = norm(item.getAttribute('data-k') || '');
      item._hay = norm(item.textContent) + ' ' + item._keys;
      item._home = item.parentNode;
    });

    // 제목에 있으면 가장 관련도가 높고, 별칭 키워드, 본문 순 — '시간 수정'을 검색했을 때
    // 본문에서 스쳐 지나가듯 언급한 항목이 위로 올라오지 않게 한다
    var score = function (item, terms) {
      var s = 0;
      terms.forEach(function (t) {
        if (item._title.indexOf(t) !== -1) s += 4;
        else if (item._keys.indexOf(t) !== -1) s += 2;
        else s += 1;
      });
      return s;
    };

    var apply = function (q) {
      // 공백으로 나눈 낱말이 모두 들어 있어야 결과로 친다 (AND 조건)
      var terms = q.trim().length ? q.trim().split(/\s+/).map(norm).filter(Boolean) : [];
      var searching = terms.length > 0;
      var matched = [];
      var shown = 0;

      hItems.forEach(function (item) {
        var catOk = curCat === 'all' || item.getAttribute('data-cat') === curCat;
        var hit = !searching || terms.every(function (t) { return item._hay.indexOf(t) !== -1; });
        var show = catOk && hit;
        item.hidden = !show;
        if (show) { shown++; if (searching) matched.push(item); }
        // 검색 중에는 결과를 펼쳐 보여준다 (검색어를 지우면 다시 접는다)
        if (searching) { if (show) item.open = true; }
        else if (!item.hasAttribute('data-keep-open')) { item.open = false; }
      });

      if (searching && hResults) {
        matched.forEach(function (item) { item._score = score(item, terms); });
        matched.sort(function (a, b) { return b._score - a._score; });
        matched.forEach(function (item) { hResults.appendChild(item); });
        hResults.hidden = shown === 0;
        hGroups.forEach(function (g) { g.hidden = true; });
      } else {
        if (hResults) { hItems.forEach(function (item) { item._home.appendChild(item); }); hResults.hidden = true; }
        hGroups.forEach(function (g) { g.hidden = !g.querySelector('.hitem:not([hidden])'); });
      }

      if (hCount) {
        hCount.textContent = terms.length || curCat !== 'all'
          ? shown + '개 항목' : '전체 ' + shown + '개 항목';
      }
      if (hEmpty) hEmpty.hidden = shown > 0;
      if (hClear) hClear.classList.toggle('on', !!q);
    };

    // 목록이 바뀌면 결과의 **처음**이 보이게 올려준다.
    // 아래쪽을 보다가 분류를 누르면 그 자리에 남아 결과의 중간·끝이 보였다(2026-08-05 제보).
    // ★내려가는 방향으로는 움직이지 않는다★ — 맨 위에서 누른 사람을 억지로 끌어내리면 더 어수선하다.
    var scrollToResultsTop = function () {
      var tools = document.querySelector('.help-tools');
      if (!tools) return;
      var nav = document.querySelector('.nav');
      var navH = nav ? nav.offsetHeight : 0;
      // sticky라도 offsetTop은 '원래 자리'를 준다(레이아웃 값) — 붙어 있는 위치가 아니다
      var y = Math.max(0, tools.offsetTop - navH - 8);
      if (window.pageYOffset <= y + 2) return;
      var go = function () { window.scrollTo({ top: y, behavior: 'smooth' }); };
      go();
      // ★다음 프레임에 한 번 더 확인★ — 항목이 숨겨져 문서 높이가 바뀌는 순간 크롬의
      // 스크롤 앵커링이 "보던 자리"로 되돌려 우리 이동을 덮을 수 있다(css의 overflow-anchor:none과
      // 이중 방어). rAF에만 맡기지 않는 이유는 프레임이 안 도는 환경에서 아예 안 움직이기 때문이다.
      if (window.requestAnimationFrame) {
        requestAnimationFrame(function () {
          if (window.pageYOffset > y + 40) go();
        });
      }
    };

    var syncUrl = function (q) {
      if (!window.history || !history.replaceState) return;
      var url = location.pathname + (q ? '?q=' + encodeURIComponent(q) : '');
      history.replaceState(null, '', url);
    };

    hSearch.addEventListener('input', function () {
      apply(hSearch.value);
      syncUrl(hSearch.value);
      scrollToResultsTop(); // 결과가 줄면 화면 밖으로 밀려나므로 한 번 올려준다
    });
    hSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hSearch.value = ''; apply(''); syncUrl(''); }
    });
    if (hClear) {
      hClear.addEventListener('click', function () {
        hSearch.value = ''; apply(''); syncUrl(''); hSearch.focus();
      });
    }
    hCats.forEach(function (btn) {
      btn.addEventListener('click', function () {
        curCat = btn.getAttribute('data-cat');
        hCats.forEach(function (b) { b.classList.toggle('on', b === btn); });
        apply(hSearch.value);
        scrollToResultsTop(); // 고른 분류의 **첫 항목**부터 보이게
      });
    });

    // ── 항목으로 이동 (#앵커) ──
    // ★`<details>`는 앵커로 찍어도 저절로 열리지 않는다★ — 그래서 항목끼리 걸어둔 링크를
    // 눌러도 "아무 일도 안 일어난" 것처럼 보였다(2026-08-05 제보). 직접 열어준다.
    var goToItem = function (id) {
      var target = document.getElementById(id);
      if (!target || !target.classList.contains('hitem')) return false;
      // 검색·분류로 가려진 항목이면 필터부터 푼다 — 안 그러면 열어도 화면에 없다
      if (target.hidden) {
        hSearch.value = '';
        curCat = 'all';
        hCats.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-cat') === 'all'); });
        apply('');
        syncUrl('');
      }
      target.open = true;
      target.setAttribute('data-keep-open', '');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return true;
    };

    // 같은 페이지 항목을 가리키는 링크는 우리가 처리한다(브라우저 기본 이동은 막는다)
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href*="#"]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      var id = decodeURIComponent(href.slice(href.indexOf('#') + 1));
      if (!id || !document.getElementById(id)) return;
      if (!document.getElementById(id).classList.contains('hitem')) return;
      e.preventDefault();
      if (window.history && history.replaceState) history.replaceState(null, '', '#' + id);
      else location.hash = id;
      goToItem(id);
    });

    // 주소창 직접 입력·뒤로가기로 해시가 바뀐 경우
    window.addEventListener('hashchange', function () {
      if (location.hash.length > 1) goToItem(decodeURIComponent(location.hash.slice(1)));
    });

    // ?q= 로 들어오면 검색어를 채우고, #앵커로 들어오면 그 항목을 펼친다
    var q0 = (location.search.match(/[?&]q=([^&]*)/) || [])[1];
    if (q0) { hSearch.value = decodeURIComponent(q0.replace(/\+/g, ' ')); }
    apply(hSearch.value);
    if (location.hash.length > 1) goToItem(decodeURIComponent(location.hash.slice(1)));
  }

  // 현재 연도
  var y = document.querySelector('[data-year]');
  if (y) y.textContent = new Date().getFullYear();
})();
