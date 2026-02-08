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
const dashboardContainer = document.getElementById('dashboard');

const tagList = document.getElementById('tag-list');
const tagNew = document.getElementById('tag-new');
const tagAdd = document.getElementById('tag-add');

const SORT_STORAGE_KEY = 'lc_tracker_sort';
const PIN_STORAGE_KEY = 'lc_tracker_pins';
const REVIEW_PROGRESS_KEY = 'lc_tracker_review_progress';
const DAILY_REVIEW_LIMIT = 1;
const REVIEW_INTERVALS = {
  Low: [4, 8, 15, 30, 60, 120, 180],
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
  reviewNotes: new Map(),
  reviewAllowExtra: false,
  reviewDay: null,
  dashboardRange: 'month',
  dashboardTrends: {},
};

state.sortBy = loadSortPreference();
state.pinnedIds = loadPinnedIds();
state.reviewDay = formatDate(new Date());

function setView(viewId) {
  views.forEach((view) => {
    view.classList.toggle('is-hidden', view.id !== `view-${viewId}`);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === viewId);
  });
  if (viewId === 'dashboard') {
    loadDashboard();
  }
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
  if (importance === 'Low') return 0;
  return 1;
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

function getBaseDateInfo(item) {
  if (item.last_review_at) {
    return { label: 'last review', date: item.last_review_at };
  }
  if (item.last_attempt_at) {
    return { label: 'last attempt', date: item.last_attempt_at };
  }
  return { label: 'created', date: item.created_at };
}

function getReviewNotes(problemId) {
  if (state.reviewNotes.has(problemId)) {
    return Promise.resolve(state.reviewNotes.get(problemId));
  }
  return api(`/api/problems/${problemId}`).then((data) => {
    const attempt = data.attempts?.[0] || null;
    const payload = attempt
      ? { html: attempt.notes_html || '', attemptAt: attempt.attempt_at }
      : null;
    state.reviewNotes.set(problemId, payload);
    return payload;
  });
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

function getReviewProgress() {
  const today = formatDate(new Date());
  try {
    const raw = localStorage.getItem(REVIEW_PROGRESS_KEY);
    if (!raw) {
      return { date: today, count: 0 };
    }
    const parsed = JSON.parse(raw);
    if (parsed.date !== today) {
      return { date: today, count: 0 };
    }
    const count = Number(parsed.count);
    return { date: today, count: Number.isFinite(count) ? count : 0 };
  } catch (err) {
    return { date: today, count: 0 };
  }
}

function saveReviewProgress(progress) {
  try {
    localStorage.setItem(REVIEW_PROGRESS_KEY, JSON.stringify(progress));
  } catch (err) {
    // Ignore storage failures.
  }
}

function incrementReviewCount() {
  const progress = getReviewProgress();
  progress.count += 1;
  saveReviewProgress(progress);
  return progress;
}

function hasReachedReviewLimit() {
  const progress = getReviewProgress();
  if (state.reviewDay !== progress.date) {
    state.reviewDay = progress.date;
    state.reviewAllowExtra = false;
  }
  return !state.reviewAllowExtra && progress.count >= DAILY_REVIEW_LIMIT;
}

function renderReviewComplete() {
  const progress = getReviewProgress();
  reviewList.innerHTML = `
    <div class="review-card review-card--done">
      <div>
        <h3>Daily review complete</h3>
        <div class="review-meta">${progress.count}/${DAILY_REVIEW_LIMIT} done today.</div>
      </div>
      <div class="review-card__actions">
        <div class="review-card__row">
          <button class="ghost small review-more" type="button">Review another</button>
        </div>
      </div>
    </div>
  `;
  const button = reviewList.querySelector('.review-more');
  if (button) {
    button.addEventListener('click', () => {
      state.reviewAllowExtra = true;
      loadReview();
    });
  }
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
  const tagText = item.tags?.length ? item.tags.join(', ') : 'No Tag';
  const baseInfo = getBaseDateInfo(item);
  const lastDays = getDaysSince(baseInfo.date);
  const lastLabel = baseInfo.label === 'created' ? 'Added' : baseInfo.label === 'last attempt' ? 'Last attempt' : 'Last review';
  const attemptLabel = item.attempt_count === 1 ? 'attempt' : 'attempts';
  const reviewLabel = item.review_count === 1 ? 'review' : 'reviews';
  const countsText = `${item.attempt_count} ${attemptLabel} · ${item.review_count} ${reviewLabel}`;
  const metaText = `${item.importance} · ${countsText} · ${lastLabel} ${lastDays}d`;
  card.innerHTML = `
    <div>
      <h3>${item.lc_num}. ${item.title}</h3>
      <div class="review-meta">${tagText}</div>
      <div class="review-meta">${metaText}</div>
    </div>
    <div class="review-card__actions">
      <div class="review-card__row">
        <button class="ghost small review-grade" data-grade="again" type="button">Again</button>
        <button class="ghost small review-grade" data-grade="good" type="button">Good</button>
        <button class="ghost small review-grade" data-grade="easy" type="button">Easy</button>
        <button class="primary small review-submit" type="button" disabled>Submit</button>
      </div>
      <div class="review-card__row">
        <button class="ghost small review-notes-toggle" type="button">Reveal notes</button>
        <button class="ghost small review-snooze" data-snooze="tomorrow" type="button">Snooze to tomorrow</button>
        <button class="ghost small review-snooze" data-snooze="weekend" type="button">Snooze to weekend</button>
      </div>
    </div>
    <div class="review-notes is-hidden" aria-live="polite"></div>
  `;
  const actionButtons = card.querySelectorAll('button');
  const gradeButtons = card.querySelectorAll('.review-grade');
  const submitButton = card.querySelector('.review-submit');
  const snoozeButtons = card.querySelectorAll('.review-snooze');
  const notesToggle = card.querySelector('.review-notes-toggle');
  const notesPanel = card.querySelector('.review-notes');
  const setDisabled = (value) => {
    actionButtons.forEach((btn) => {
      btn.disabled = value;
    });
  };
  const runAction = (promise) => {
    setDisabled(true);
    promise
      .then(() => {
        incrementReviewCount();
        loadReview();
      })
      .catch(() => setDisabled(false));
  };
  let selectedGrade = null;
  gradeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedGrade = button.dataset.grade;
      gradeButtons.forEach((btn) => {
        btn.classList.toggle('is-selected', btn === button);
      });
      if (submitButton) {
        submitButton.disabled = false;
      }
    });
  });
  if (submitButton) {
    submitButton.addEventListener('click', () => {
      if (!selectedGrade) return;
      runAction(markReviewed(item.id, selectedGrade));
    });
  }
  snoozeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.snooze;
      const date = target === 'weekend' ? getUpcomingSaturdayDate() : getTomorrowDate();
      runAction(snoozeReview(item.id, date));
    });
  });
  notesToggle.addEventListener('click', () => {
    const hidden = notesPanel.classList.contains('is-hidden');
    if (hidden) {
      notesPanel.classList.remove('is-hidden');
      notesToggle.textContent = 'Hide notes';
      if (!notesPanel.dataset.loaded) {
        notesPanel.dataset.loaded = 'true';
        notesPanel.innerHTML = '<div class="review-notes__empty muted">Loading notes...</div>';
        getReviewNotes(item.id)
          .then((payload) => {
            if (!payload || !payload.html) {
              notesPanel.innerHTML = '<div class="review-notes__empty">No notes yet.</div>';
              return;
            }
            notesPanel.innerHTML = `
              <div class="review-notes__meta">Last notes: ${payload.attemptAt}</div>
              <div class="review-notes__body markdown">${payload.html}</div>
            `;
            const body = notesPanel.querySelector('.review-notes__body');
            enhanceMarkdownBlocks(body);
            typesetMath(body);
          })
          .catch(() => {
            notesPanel.innerHTML = '<div class="review-notes__empty">Failed to load notes.</div>';
          });
      }
    } else {
      notesPanel.classList.add('is-hidden');
      notesToggle.textContent = 'Reveal notes';
    }
  });
  reviewList.appendChild(card);
}

function renderDashboard(data) {
  if (!dashboardContainer) return;
  if (!data || !data.totals) {
    dashboardContainer.innerHTML = '<div class="empty">No data yet.</div>';
    return;
  }
  const totals = data.totals || {};
  const activity = data.activity || {};
  const coverage = activity.coverage_30d || { count: 0, total: 0, percent: 0 };
  const importance = data.importance || {};
  const topTags = data.top_tags || [];
  state.dashboardTrends = data.trends || {};
  const coverageText = coverage.total ? `${coverage.count}/${coverage.total} (${coverage.percent}%)` : '—';

  const stats = [
    { label: 'Total problems', value: totals.problems ?? 0 },
    { label: 'Total attempts', value: totals.attempts ?? 0 },
    { label: 'Total reviews', value: totals.reviews ?? 0 },
    { label: 'Active days', value: activity.active_days_30d ?? 0, hint: 'last 30d' },
  ];

  const importanceItems = [
    { label: 'High', count: importance.High ?? 0 },
    { label: 'Medium', count: importance.Medium ?? 0 },
    { label: 'Low', count: importance.Low ?? 0 },
  ];

  const barRows = (items) => {
    const max = Math.max(...items.map((item) => item.count), 1);
    return items
      .map((item) => {
        const width = Math.round((item.count / max) * 100);
        return `
          <div class="bar-row">
            <div class="bar-label">${item.label}</div>
            <div class="bar-track"><span style="width: ${width}%"></span></div>
            <div class="bar-value">${item.count}</div>
          </div>
        `;
      })
      .join('');
  };

  const tagRows = topTags.length
    ? barRows(topTags.map((tag) => ({ label: tag.name, count: tag.count })))
    : '<div class="empty">No tags yet.</div>';

  dashboardContainer.innerHTML = `
    <div class="dashboard-grid">
      ${stats
        .map(
          (stat) => `
            <div class="stat-card">
              <div class="stat-label">${stat.label}</div>
              <div class="stat-value">${stat.value}</div>
              ${stat.hint ? `<div class="stat-hint">${stat.hint}</div>` : ''}
            </div>
          `,
        )
        .join('')}
    </div>
    <div class="chart-card">
      <div class="chart-header">
        <h3>Attempts vs reviews</h3>
        <div class="chart-toggle" role="group" aria-label="Trend range">
          <button class="ghost small" data-range="week" type="button">Week</button>
          <button class="ghost small" data-range="month" type="button">Month</button>
          <button class="ghost small" data-range="year" type="button">Year</button>
        </div>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-dot legend-attempts"></span>Attempted</span>
        <span class="legend-item"><span class="legend-dot legend-reviews"></span>Reviewed</span>
      </div>
      <div class="chart-note">Unique problems per day/month.</div>
      <div class="chart-canvas" id="trend-chart"></div>
      <div class="chart-axis" id="trend-axis"></div>
    </div>
    <div class="dashboard-sections">
      <div class="dashboard-section">
        <h3>Activity</h3>
        <div class="dashboard-list">
          <div class="dashboard-row">
            <span>Last attempt</span>
            <strong>${activity.last_attempt_at || '—'}</strong>
          </div>
          <div class="dashboard-row">
            <span>Last review</span>
            <strong>${activity.last_review_at || '—'}</strong>
          </div>
          <div class="dashboard-row">
            <span>Attempts (30d)</span>
            <strong>${activity.attempts_30d ?? 0}</strong>
          </div>
          <div class="dashboard-row">
            <span>Touched (30d)</span>
            <strong>${coverageText}</strong>
          </div>
        </div>
      </div>
      <div class="dashboard-section">
        <h3>Importance mix</h3>
        <div class="bar-list">
          ${barRows(importanceItems)}
        </div>
      </div>
      <div class="dashboard-section">
        <h3>Top tags</h3>
        <div class="bar-list">
          ${tagRows}
        </div>
      </div>
    </div>
  `;

  const toggleButtons = dashboardContainer.querySelectorAll('.chart-toggle button');
  toggleButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.range === state.dashboardRange);
    button.addEventListener('click', () => {
      state.dashboardRange = button.dataset.range;
      toggleButtons.forEach((btn) => {
        btn.classList.toggle('is-active', btn === button);
      });
      renderTrendChart();
    });
  });
  renderTrendChart();
}

function getTrendSeries() {
  const trends = state.dashboardTrends || {};
  const series = trends[state.dashboardRange] || {};
  const labels = Array.isArray(series.labels) ? series.labels : [];
  const attempts = Array.isArray(series.attempts) ? series.attempts : [];
  const reviews = Array.isArray(series.reviews) ? series.reviews : [];
  return { labels, attempts, reviews };
}

function buildLinePoints(values, width, height, padding, maxValue) {
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const count = values.length;
  const step = count > 1 ? usableWidth / (count - 1) : 0;
  return values.map((value, index) => {
    const x = padding + step * index;
    const ratio = maxValue ? value / maxValue : 0;
    const y = height - padding - usableHeight * ratio;
    return { x, y, value, index };
  });
}

function renderTrendChart() {
  const chart = document.getElementById('trend-chart');
  const axis = document.getElementById('trend-axis');
  if (!chart || !axis) return;
  const { labels, attempts, reviews } = getTrendSeries();
  if (!labels.length) {
    chart.innerHTML = '<div class="empty">No trend data yet.</div>';
    axis.innerHTML = '';
    return;
  }

  const width = 640;
  const height = 220;
  const padding = 28;
  const maxValue = Math.max(1, ...attempts, ...reviews);
  const gridLines = 4;
  const gridMarkup = Array.from({ length: gridLines + 1 })
    .map((_, index) => {
      const y = padding + ((height - padding * 2) * index) / gridLines;
      return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" />`;
    })
    .join('');

  const attemptsPoints = buildLinePoints(attempts, width, height, padding, maxValue);
  const reviewsPoints = buildLinePoints(reviews, width, height, padding, maxValue);

  const formatPoints = (points) =>
    points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');

  const attemptsLine = formatPoints(attemptsPoints);
  const reviewsLine = formatPoints(reviewsPoints);

  const tickCount = 4;
  const tickMarkup = Array.from({ length: tickCount + 1 })
    .map((_, index) => {
      const value = Math.round((maxValue * index) / tickCount);
      const ratio = maxValue ? value / maxValue : 0;
      const y = height - padding - (height - padding * 2) * ratio;
      return `
        <g class="chart-axis-y__tick">
          <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" />
          <text x="${padding - 8}" y="${y + 4}" text-anchor="end">${value}</text>
        </g>
      `;
    })
    .join('');

  chart.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Attempts and reviews over time">
      <g class="chart-axis-y">
        <text class="chart-axis-label" x="${padding}" y="${padding - 10}">Count</text>
        ${tickMarkup}
      </g>
      <g class="chart-grid">${gridMarkup}</g>
      <polyline class="chart-line chart-line--attempts" points="${attemptsLine}" />
      <polyline class="chart-line chart-line--reviews" points="${reviewsLine}" />
      <g class="chart-points chart-points--attempts">
        ${attemptsPoints
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="2.6">
                <title>${labels[point.index]}: ${point.value}</title>
              </circle>
            `,
          )
          .join('')}
      </g>
      <g class="chart-points chart-points--reviews">
        ${reviewsPoints
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="2.6">
                <title>${labels[point.index]}: ${point.value}</title>
              </circle>
            `,
          )
          .join('')}
      </g>
    </svg>
  `;

  const midIndex = Math.floor(labels.length / 2);
  const leftLabel = labels[0];
  const midLabel = labels[midIndex];
  const rightLabel = labels[labels.length - 1];
  axis.innerHTML = `
    <span>${leftLabel}</span>
    <span>${midLabel}</span>
    <span>${rightLabel}</span>
  `;
}

function loadDashboard() {
  if (!dashboardContainer) return;
  dashboardContainer.innerHTML = '<div class="empty">Loading dashboard...</div>';
  api('/api/dashboard')
    .then((data) => renderDashboard(data))
    .catch(() => {
      dashboardContainer.innerHTML = '<div class="empty">Unable to load dashboard.</div>';
    });
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
  state.reviewNotes.clear();
  if (hasReachedReviewLimit()) {
    renderReviewComplete();
    return Promise.resolve();
  }
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

function markReviewed(problemId, grade = 'good') {
  return api(`/api/reviews/${problemId}`, {
    method: 'POST',
    body: JSON.stringify({ grade }),
  });
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
