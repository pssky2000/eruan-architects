(function () {
  var root = document.documentElement;
  root.classList.add('js');

  // 첫 화면 드로잉: 선 길이를 재서 한 번 그려지게 한다
  var drawing = document.querySelector('.sheet__drawing');
  if (drawing) {
    drawing.querySelectorAll('.draw line, .draw polyline, .draw rect').forEach(function (el) {
      try { el.style.setProperty('--len', Math.ceil(el.getTotalLength()) + 1); } catch (e) {}
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('is-drawn'); });
    });
  }

  // 작품 목록
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  document.querySelectorAll('[data-works]').forEach(function (box) {
    var works = Array.isArray(window.WORKS) ? window.WORKS : [];
    var limit = Number(box.getAttribute('data-limit')) || works.length;
    if (!works.length) {
      box.innerHTML =
        '<div class="works-empty">' +
          '<h3>완공 작품 사진을 정리하고 있어요</h3>' +
          '<p>사진이 준비되는 대로 이곳에 올릴게요. 지금 비슷한 건물을 설계한 적이 있는지 궁금하면, 상담 신청에 건물 종류와 규모를 적어 주세요.</p>' +
          '<a class="btn btn--line" href="index.html#apply">설계 상담 신청</a>' +
        '</div>';
      return;
    }
    box.innerHTML = works.slice(0, limit).map(function (w) {
      var meta = [w.type, w.place, w.year].filter(Boolean).map(esc).join(', ');
      return '<figure class="work">' +
        '<div class="work__frame"><img src="' + esc(w.image) + '" alt="' + esc(w.title) + ' 사진" loading="lazy"></div>' +
        '<figcaption><p class="work__title">' + esc(w.title) + '</p>' +
        (meta ? '<p class="work__meta">' + meta + '</p>' : '') +
        '</figcaption></figure>';
    }).join('');
  });

  // 상담 신청
  var form = document.getElementById('apply-form');
  if (!form) return;
  var status = form.querySelector('.form__status');
  var submit = form.querySelector('.form__submit');
  var say = function (msg, ok) {
    status.textContent = msg;
    status.className = 'form__status ' + (ok ? 'is-ok' : 'is-error');
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.elements.name, contact = form.elements.contact, consent = form.elements.consent;
    [name, contact].forEach(function (el) { el.removeAttribute('aria-invalid'); });

    if (!name.value.trim()) { name.setAttribute('aria-invalid', 'true'); name.focus(); return say('이름을 적어 주세요.'); }
    if (!contact.value.trim()) { contact.setAttribute('aria-invalid', 'true'); contact.focus(); return say('연락처를 적어 주세요.'); }
    if (!consent.checked) { consent.focus(); return say('개인정보 수집과 이용에 동의해 주세요.'); }

    submit.disabled = true;
    say('보내는 중이에요…', true);
    fetch('/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value,
        contact: contact.value,
        message: form.elements.message.value,
        website: form.elements.website.value,
        consent: consent.checked
      })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || '보내지 못했어요. 잠시 뒤 다시 시도하거나 043-224-7575로 전화해 주세요.');
        form.reset();
        say('상담 신청이 접수됐어요. 확인 후 연락드릴게요.', true);
      });
    }).catch(function (err) {
      say(err.message && err.message !== 'Failed to fetch' ? err.message : '보내지 못했어요. 잠시 뒤 다시 시도하거나 043-224-7575로 전화해 주세요.');
    }).finally(function () {
      submit.disabled = false;
    });
  });
})();
