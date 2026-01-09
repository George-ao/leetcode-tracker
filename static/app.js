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
const libraryList = document.getElementById('library-list');
const libraryDetail = document.getElementById('library-detail');

const tagList = document.getElementById('tag-list');
const tagNew = document.getElementById('tag-new');
const tagAdd = document.getElementById('tag-add');

const state = {
  tags: [],
  problems: [],
  activeProblemId: null,
  searchTags: [],
};

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
  reviews.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'review-card';
    const days = item.days_since ?? '-';
    const tagText = item.tags?.length ? item.tags.join(', ') : 'No Tag';
    card.innerHTML = `
      <div>
        <h3>${item.lc_num}. ${item.title}</h3>
        <div class="review-meta">${tagText} | Importance ${item.importance} | Attempts ${item.attempt_count} | Reviews ${item.review_count} | Days since ${days}</div>
      </div>
      <button class="primary small">Mark Reviewed</button>
    `;
    const button = card.querySelector('button');
    button.addEventListener('click', () => {
      button.disabled = true;
      markReviewed(item.id).then(() => {
        card.classList.add('is-done');
        button.textContent = 'Done ✓';
      });
    });
    reviewList.appendChild(card);
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
    const days = item.days_since ?? '-';
    const tagText = item.tags?.length ? item.tags.join(', ') : 'No Tag';
    row.innerHTML = `
      <h4>${item.lc_num}. ${item.title}</h4>
      <p>${tagText} | Attempts ${item.attempt_count} | Reviews ${item.review_count} | Days since ${days}</p>
    `;
    row.addEventListener('click', () => loadProblemDetail(item.id));
    libraryList.appendChild(row);
  });
}

function renderProblemDetail(detail, attempts) {
  libraryDetail.innerHTML = '';
  const days = detail.days_since ?? '-';
  const header = document.createElement('div');
  header.className = 'detail-header';
  const tagText = detail.tags?.length ? detail.tags.join(', ') : 'No Tag';
  header.innerHTML = `
    <div>
      <h2>${detail.lc_num}. ${detail.title}</h2>
      <div class="detail-meta">${tagText} | Importance ${detail.importance} | Attempts ${attempts.length} | Reviews ${detail.review_count} | Days since ${days}</div>
    </div>
    <button class="ghost small" id="delete-problem">Delete Problem</button>
  `;
  libraryDetail.appendChild(header);

  document.getElementById('delete-problem').addEventListener('click', () => deleteProblem(detail.id));

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
  return api('/api/reviews').then((data) => renderReview(data.reviews || []));
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
    state.activeProblemId = state.problems[0]?.id || null;
    renderLibraryList(state.problems);
    if (state.activeProblemId) {
      loadProblemDetail(state.activeProblemId);
    }
  });
}

function loadProblemDetail(problemId) {
  state.activeProblemId = problemId;
  renderLibraryList(state.problems);
  api(`/api/problems/${problemId}`).then((data) => {
    renderProblemDetail(data.detail, data.attempts || []);
  });
}

function markReviewed(problemId) {
  return api(`/api/reviews/${problemId}`, { method: 'POST' });
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
