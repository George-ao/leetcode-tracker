const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('.nav__item');

const reviewList = document.getElementById('review-list');
const reviewRefresh = document.getElementById('review-refresh');
const addForm = document.getElementById('add-form');
const addTagsContainer = document.getElementById('add-tags');
const addStatus = document.getElementById('add-status');

const searchInput = document.getElementById('search-input');
const searchTagsContainer = document.getElementById('search-tags');
const searchButton = document.getElementById('search-button');
const sortSelect = document.getElementById('sort-select');
const libraryList = document.getElementById('library-list');
const libraryDetail = document.getElementById('library-detail');

const tagList = document.getElementById('tag-list');
const tagNew = document.getElementById('tag-new');
const tagAdd = document.getElementById('tag-add');

const SORT_STORAGE_KEY = 'lc_tracker_sort';
const PIN_STORAGE_KEY = 'lc_tracker_pins';
const REVIEW_INTERVALS = {
  Medium: [2, 4, 7, 15, 30, 60, 90],
  High: [1, 2, 4, 7, 15, 30, 60],
};

const state = {
  tags: [],
  problems: [],
  activeProblemId: null,
  searchTags: [],
  sortBy: 'last_attempt',
  pinnedIds: new Set(),
};

state.sortBy = loadSortPreference();
state.pinnedIds = loadPinnedIds();

function setView(viewId) {
  views.forEach((view) => {
    view.classList.toggle('is-hidden', view.id !== `view-${viewId}`);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === viewId);
  });
}

function api(url, options = {}) {
  const opts = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  return fetch(url, opts).then((res) => {
    if (!res.ok) {
      return res.json().then((data) => Promise.reject(data));
    }
    return res.json();
  });
}

const CODE_KEYWORDS = [
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'class',
  'new',
  'this',
  'super',
  'try',
  'catch',
  'finally',
  'throw',
  'import',
  'from',
  'export',
  'default',
  'async',
  'await',
  'def',
  'lambda',
  'yield',
  'with',
  'as',
  'pass',
  'raise',
  'public',
  'private',
  'protected',
  'static',
  'enum',
  'struct',
  'interface',
  'extends',
  'implements',
  'package',
  'namespace',
];

const CODE_LITERALS = ['true', 'false', 'null', 'None', 'nil'];
const CODE_LITERAL_SET = new Set(CODE_LITERALS);
const CODE_TOKEN_REGEX = new RegExp(
  `\\b(${CODE_KEYWORDS.concat(CODE_LITERALS).join('|')}|\\d+(?:\\.\\d+)?)\\b`,
  'g',
);

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightTextSegment(text) {
  let html = '';
  let lastIndex = 0;
  text.replace(CODE_TOKEN_REGEX, (match, _token, offset) => {
    html += escapeHtml(text.slice(lastIndex, offset));
    let className = 'tok-keyword';
    if (/^\d/.test(match)) {
      className = 'tok-number';
    } else if (CODE_LITERAL_SET.has(match)) {
      className = 'tok-literal';
    }
    html += `<span class="${className}">${escapeHtml(match)}</span>`;
    lastIndex = offset + match.length;
    return match;
  });
  html += escapeHtml(text.slice(lastIndex));
  return html;
}

function highlightLine(line) {
  const segments = [];
  let current = '';
  let mode = 'text';
  let quote = null;

  const pushSegment = () => {
    if (!current) return;
    segments.push({ type: mode, value: current });
    current = '';
  };

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (mode === 'text') {
      if (char === '"' || char === "'" || char === '`') {
        pushSegment();
        mode = 'string';
        quote = char;
        current = char;
        continue;
      }
      if (char === '/' && line[i + 1] === '/') {
        pushSegment();
        segments.push({ type: 'comment', value: line.slice(i) });
        break;
      }
      if (char === '-' && line[i + 1] === '-' && (i === 0 || /\s/.test(line[i - 1]))) {
        pushSegment();
        segments.push({ type: 'comment', value: line.slice(i) });
        break;
      }
      if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
        pushSegment();
        segments.push({ type: 'comment', value: line.slice(i) });
        break;
      }
      current += char;
      continue;
    }

    current += char;
    if (char === '\\' && i + 1 < line.length) {
      current += line[i + 1];
      i += 1;
      continue;
    }
    if (char === quote) {
      segments.push({ type: 'string', value: current });
      current = '';
      mode = 'text';
      quote = null;
    }
  }

  if (current) {
    segments.push({ type: mode, value: current });
  }

  return segments
    .map((segment) => {
      if (segment.type === 'string') {
        return `<span class="tok-string">${escapeHtml(segment.value)}</span>`;
      }
      if (segment.type === 'comment') {
        return `<span class="tok-comment">${escapeHtml(segment.value)}</span>`;
      }
      return highlightTextSegment(segment.value);
    })
    .join('');
}

function getLanguageLabel(code) {
  const className = Array.from(code.classList).find((name) => name.startsWith('language-'));
  if (!className) {
    return 'CODE';
  }
  return className.replace('language-', '').toUpperCase();
}

function flashCopyState(button) {
  const original = button.textContent;
  button.textContent = 'Copied';
  button.classList.add('is-copied');
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove('is-copied');
  }, 1200);
}

function fallbackCopy(text, button) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (err) {
  }
  document.body.removeChild(textarea);
  flashCopyState(button);
}

function copyToClipboard(text, button) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(() => flashCopyState(button))
      .catch(() => fallbackCopy(text, button));
  } else {
    fallbackCopy(text, button);
  }
}

function enhanceMarkdownBlocks(container) {
  const blocks = container.querySelectorAll('pre > code');
  blocks.forEach((code) => {
    const pre = code.parentElement;
    if (!pre || pre.dataset.enhanced === 'true') return;

    const raw = code.textContent || '';
    const language = getLanguageLabel(code);
    const lines = raw.split('\n');

    code.innerHTML = lines
      .map((line) => {
        const highlighted = highlightLine(line);
        return `<span class="code-line">${highlighted || '&nbsp;'}</span>`;
      })
      .join('');

    pre.dataset.enhanced = 'true';
    pre.classList.add('code-block__pre');
    code.classList.add('code-block__code');

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';

    const header = document.createElement('div');
    header.className = 'code-block__header';

    const label = document.createElement('span');
    label.className = 'code-block__lang';
    label.textContent = language;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ghost small code-block__copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => copyToClipboard(raw, copyBtn));

    header.appendChild(label);
    header.appendChild(copyBtn);

    const parent = pre.parentNode;
    parent.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
}

function typesetMath(container) {
  if (!window.MathJax || typeof window.MathJax.typesetPromise !== 'function') {
    return;
  }
  window.MathJax.typesetPromise([container]).catch(() => {});
}

function loadSortPreference() {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    if (stored === 'importance' || stored === 'review_due' || stored === 'last_attempt') {
      return stored;
    }
    return 'last_attempt';
  } catch (err) {
    return 'last_attempt';
  }
}

function saveSortPreference(value) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, value);
  } catch (err) {
    // Ignore storage failures.
  }
}

function loadPinnedIds() {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const ids = parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    return new Set(ids);
  } catch (err) {
    return new Set();
  }
}

function savePinnedIds() {
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(Array.from(state.pinnedIds)));
  } catch (err) {
    // Ignore storage failures.
  }
}

function isPinned(id) {
  return state.pinnedIds.has(Number(id));
}

function togglePin(id) {
  const idValue = Number(id);
  if (!Number.isFinite(idValue)) return;
  if (state.pinnedIds.has(idValue)) {
    state.pinnedIds.delete(idValue);
  } else {
    state.pinnedIds.add(idValue);
  }
  savePinnedIds();
  renderLibraryList(getSortedProblems());
}

function parseDateValue(value) {
  if (!value) return 0;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
}

function getDaysSince(value) {
  const timestamp = parseDateValue(value);
  if (!timestamp) return 0;
  const diff = Date.now() - timestamp;
  return Math.floor(diff / 86400000);
}

function getImportanceRank(importance) {
  if (importance === 'High') return 2;
  if (importance === 'Medium') return 1;
  return 0;
}

function getDueScore(item) {
  if (item.snooze_until) {
    const snoozeDays = getDaysSince(item.snooze_until);
    if (snoozeDays < 0) {
      return -9999;
    }
  }
  const intervals = REVIEW_INTERVALS[item.importance] || REVIEW_INTERVALS.Medium;
  const stage = Math.min(item.review_count || 0, intervals.length - 1);
  const requiredDays = intervals[stage];
  const baseDate = item.last_review_at || item.last_attempt_at || item.created_at;
  const deltaDays = getDaysSince(baseDate);
  return deltaDays - requiredDays;
}

function formatDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTomorrowDate() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return formatDate(value);
}

function getUpcomingSaturdayDate() {
  const value = new Date();
  const day = value.getDay();
  let daysUntil = 6 - day;
  if (daysUntil <= 0) {
    daysUntil += 7;
  }
  value.setDate(value.getDate() + daysUntil);
  return formatDate(value);
}

function getSortedProblems() {
  const items = [...state.problems];
  items.sort((a, b) => {
    const pinnedDiff = (isPinned(b.id) ? 1 : 0) - (isPinned(a.id) ? 1 : 0);
    if (pinnedDiff) return pinnedDiff;

    if (state.sortBy === 'importance') {
      const diff = getImportanceRank(b.importance) - getImportanceRank(a.importance);
      if (diff) return diff;
    } else if (state.sortBy === 'review_due') {
      const diff = getDueScore(b) - getDueScore(a);
      if (diff) return diff;
    } else {
      const diff =
        parseDateValue(b.last_attempt_at || b.created_at) -
        parseDateValue(a.last_attempt_at || a.created_at);
      if (diff) return diff;
    }

    return parseDateValue(b.last_attempt_at || b.created_at) - parseDateValue(a.last_attempt_at || a.created_at);
  });
  return items;
}

function setSearchTags(tags) {
  state.searchTags = tags;
  renderTagSelector(searchTagsContainer, state.tags, state.searchTags);
}

function applyTagFilter(tag) {
  const value = (tag || '').trim();
  if (!value) return;
  if (state.searchTags.length === 1 && state.searchTags[0] === value) {
    setSearchTags([]);
  } else {
    setSearchTags([value]);
  }
  loadLibrary();
}

function renderTagSelector(container, tags, selected) {
  container.innerHTML = '';
  tags.forEach((tag) => {
    const label = document.createElement('label');
    label.className = 'tag-chip';
    const checked = selected.includes(tag) ? 'checked' : '';
    label.innerHTML = `<input type="checkbox" value="${tag}" ${checked} />${tag}`;
    container.appendChild(label);
  });
}

function renderTags() {
  renderTagSelector(addTagsContainer, state.tags, []);
  renderTagSelector(searchTagsContainer, state.tags, state.searchTags);

  tagList.innerHTML = '';
  state.tags.forEach((tag) => {
    const row = document.createElement('div');
    row.className = 'tag-row';
    row.innerHTML = `
      <div>${tag}</div>
      <input placeholder="Rename to..." />
      <button class="ghost small">Rename</button>
    `;
    const input = row.querySelector('input');
    const button = row.querySelector('button');
    button.addEventListener('click', () => renameTag(tag, input.value));
    tagList.appendChild(row);
  });
}

function renderReview(reviews) {
  reviewList.innerHTML = '';
  if (!reviews.length) {
    reviewList.innerHTML = '<div class="empty">Nothing due today.</div>';
    return;
  }
  const item = reviews[0];
  const card = document.createElement('div');
  card.className = 'review-card';
  const days = item.days_since ?? '-';
  const tagText = item.tags?.length ? item.tags.join(', ') : 'No Tag';
  card.innerHTML = `
    <div>
      <h3>${item.lc_num}. ${item.title}</h3>
      <div class="review-meta">${tagText} | Importance ${item.importance} | Attempts ${item.attempt_count} | Reviews ${item.review_count} | Days since ${days}</div>
    </div>
    <div class="review-card__actions">
      <button class="primary small" type="button">Mark Reviewed</button>
      <button class="ghost small" type="button">Snooze to tomorrow</button>
      <button class="ghost small" type="button">Snooze to weekend</button>
    </div>
  `;
  const buttons = card.querySelectorAll('button');
  const reviewBtn = buttons[0];
  const snoozeTomorrowBtn = buttons[1];
  const snoozeWeekendBtn = buttons[2];
  const setDisabled = (value) => {
    buttons.forEach((btn) => {
      btn.disabled = value;
    });
  };
  const runAction = (promise) => {
    setDisabled(true);
    promise.then(loadReview).catch(() => setDisabled(false));
  };
  reviewBtn.addEventListener('click', () => runAction(markReviewed(item.id)));
  snoozeTomorrowBtn.addEventListener('click', () =>
    runAction(snoozeReview(item.id, getTomorrowDate())),
  );
  snoozeWeekendBtn.addEventListener('click', () =>
    runAction(snoozeReview(item.id, getUpcomingSaturdayDate())),
  );
  reviewList.appendChild(card);
}

function renderLibraryList(problems) {
  libraryList.innerHTML = '';
  if (!problems.length) {
    libraryList.innerHTML = '<div class="empty">No results.</div>';
    libraryDetail.innerHTML = '<div class="empty">Select a problem to view details.</div>';
    return;
  }
  problems.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    if (item.id === state.activeProblemId) {
      row.classList.add('active');
    }
    const pinned = isPinned(item.id);
    if (pinned) {
      row.classList.add('is-pinned');
    }
    const days = item.days_since ?? '-';
    const tagText = item.tags?.length ? item.tags.join(', ') : 'No Tag';
    row.innerHTML = `
      <div class="list-item__header">
        <h4>${item.lc_num}. ${item.title}</h4>
        <button class="ghost small pin-toggle${pinned ? ' is-pinned' : ''}" type="button">
          ${pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>
      <p>${tagText} | Attempts ${item.attempt_count} | Reviews ${item.review_count} | Days since ${days}</p>
    `;
    const pinButton = row.querySelector('.pin-toggle');
    pinButton.addEventListener('click', (event) => {
      event.stopPropagation();
      togglePin(item.id);
    });
    row.addEventListener('click', () => loadProblemDetail(item.id));
    libraryList.appendChild(row);
  });
}

function renderProblemDetail(detail, attempts) {
  libraryDetail.innerHTML = '';
  const days = detail.days_since ?? '-';
  const header = document.createElement('div');
  header.className = 'detail-header';
  const tagMarkup = detail.tags?.length
    ? detail.tags
        .map((tag) => {
          const active = state.searchTags.includes(tag) ? ' is-active' : '';
          return `<button class="detail-tag${active}" data-tag="${tag}" type="button">${tag}</button>`;
        })
        .join('')
    : '<span class="detail-tag detail-tag--empty">No tags</span>';
  header.innerHTML = `
    <div class="detail-info">
      <h2>${detail.lc_num}. ${detail.title}</h2>
      <div class="detail-tags">${tagMarkup}</div>
      <div class="detail-meta">Importance ${detail.importance} | Attempts ${attempts.length} | Reviews ${detail.review_count} | Days since ${days}</div>
    </div>
    <button class="ghost small" id="delete-problem">Delete Problem</button>
  `;
  libraryDetail.appendChild(header);

  document.getElementById('delete-problem').addEventListener('click', () => deleteProblem(detail.id));
  header.querySelectorAll('.detail-tag[data-tag]').forEach((tagButton) => {
    tagButton.addEventListener('click', () => applyTagFilter(tagButton.dataset.tag));
  });

  if (!attempts.length) {
    libraryDetail.innerHTML += '<div class="empty">No notes yet.</div>';
    return;
  }

  attempts.forEach((attempt) => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `
      <div class="note-card__header">
        <div>${attempt.attempt_at}</div>
        <div class="note-actions">
          <button class="ghost small">Edit</button>
          <button class="ghost small">Save</button>
          <button class="ghost small">Cancel</button>
          <button class="ghost small">Delete</button>
        </div>
      </div>
      <textarea rows="10" class="note-editor is-hidden">${attempt.notes}</textarea>
      <div class="note-preview markdown">${attempt.notes_html || ''}</div>
    `;
    const buttons = card.querySelectorAll('button');
    const editBtn = buttons[0];
    const saveBtn = buttons[1];
    const cancelBtn = buttons[2];
    const deleteBtn = buttons[3];
    const textarea = card.querySelector('.note-editor');
    const preview = card.querySelector('.note-preview');
    enhanceMarkdownBlocks(preview);
    typesetMath(preview);

    editBtn.addEventListener('click', () => {
      textarea.classList.remove('is-hidden');
      preview.classList.add('is-hidden');
    });
    cancelBtn.addEventListener('click', () => {
      textarea.value = attempt.notes;
      textarea.classList.add('is-hidden');
      preview.classList.remove('is-hidden');
    });
    saveBtn.addEventListener('click', () => updateAttempt(attempt.id, textarea.value));
    deleteBtn.addEventListener('click', () => deleteAttempt(attempt.id));
    libraryDetail.appendChild(card);
  });
}

function loadTags() {
  return api('/api/tags').then((data) => {
    state.tags = data.tags || [];
    renderTags();
  });
}

function loadReview() {
  return api('/api/reviews?limit=1').then((data) => renderReview(data.reviews || []));
}

function getSelectedTags(container) {
  return Array.from(container.querySelectorAll('input[type="checkbox"]'))
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function loadLibrary() {
  state.searchTags = getSelectedTags(searchTagsContainer);
  const params = new URLSearchParams({
    search: searchInput.value.trim(),
    tags: state.searchTags.join(','),
  });
  return api(`/api/problems?${params.toString()}`).then((data) => {
    state.problems = data.problems || [];
    const sorted = getSortedProblems();
    const hasActive = sorted.some((item) => item.id === state.activeProblemId);
    if (!hasActive) {
      state.activeProblemId = sorted[0]?.id || null;
    }
    renderLibraryList(sorted);
    if (state.activeProblemId) {
      loadProblemDetail(state.activeProblemId);
    }
  });
}

function loadProblemDetail(problemId) {
  state.activeProblemId = problemId;
  renderLibraryList(getSortedProblems());
  api(`/api/problems/${problemId}`).then((data) => {
    renderProblemDetail(data.detail, data.attempts || []);
  });
}

function markReviewed(problemId) {
  return api(`/api/reviews/${problemId}`, { method: 'POST' });
}

function snoozeReview(problemId, until) {
  return api(`/api/reviews/${problemId}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ until }),
  });
}

function addEntry(formData) {
  const payload = Object.fromEntries(formData.entries());
  const newTag = payload.new_tag?.trim();
  const selectedTags = getSelectedTags(addTagsContainer);

  const submit = () => {
    api('/api/attempts', {
      method: 'POST',
      body: JSON.stringify({
        lc_num: payload.lc_num,
        title: payload.title,
        tags: selectedTags,
        importance: payload.importance,
        notes: payload.notes,
      }),
    })
      .then(() => {
        addStatus.textContent = 'Saved.';
        addForm.reset();
        loadLibrary();
        loadReview();
      })
      .catch((err) => {
        addStatus.textContent = err.error || 'Failed to save.';
      });
  };

  if (newTag) {
    api('/api/tags', { method: 'POST', body: JSON.stringify({ name: newTag }) })
      .then(() => loadTags())
      .then(() => {
        selectedTags.push(newTag);
        submit();
      });
  } else {
    submit();
  }
}

function renameTag(oldName, newName) {
  if (!newName.trim()) return;
  api('/api/tags/rename', { method: 'POST', body: JSON.stringify({ old: oldName, new: newName }) })
    .then(loadTags)
    .then(loadLibrary);
}

function updateAttempt(id, notes) {
  api(`/api/attempts/${id}`, { method: 'PATCH', body: JSON.stringify({ notes }) })
    .then(() => loadProblemDetail(state.activeProblemId));
}

function deleteAttempt(id) {
  api(`/api/attempts/${id}`, { method: 'DELETE' })
    .then(() => loadProblemDetail(state.activeProblemId));
}

function deleteProblem(id) {
  api(`/api/problems/${id}`, { method: 'DELETE' })
    .then(() => loadLibrary());
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

reviewRefresh.addEventListener('click', loadReview);
searchButton.addEventListener('click', loadLibrary);
if (searchTagsContainer) {
  searchTagsContainer.addEventListener('change', (event) => {
    if (event.target && event.target.matches('input[type="checkbox"]')) {
      loadLibrary();
    }
  });
}
if (sortSelect) {
  sortSelect.value = state.sortBy;
  sortSelect.addEventListener('change', () => {
    state.sortBy = sortSelect.value;
    saveSortPreference(state.sortBy);
    renderLibraryList(getSortedProblems());
  });
}

addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addStatus.textContent = '';
  addEntry(new FormData(addForm));
});

tagAdd.addEventListener('click', () => {
  if (!tagNew.value.trim()) return;
  api('/api/tags', { method: 'POST', body: JSON.stringify({ name: tagNew.value }) })
    .then(() => {
      tagNew.value = '';
      loadTags();
      loadLibrary();
    });
});

loadTags().then(() => {
  loadReview();
  loadLibrary();
});
