const fileInput = document.querySelector('#json-file');
const emptyState = document.querySelector('#empty-state');
const chat = document.querySelector('#chat');
const chatInfo = document.querySelector('#chat-info');
const messagesEl = document.querySelector('#messages');
const searchWrap = document.querySelector('#search-wrap');
const searchInput = document.querySelector('#search');
const matchCount = document.querySelector('#match-count');
const previousButton = document.querySelector('#previous-match');
const nextButton = document.querySelector('#next-match');
const toast = document.querySelector('#toast');

let messages = [];
let selectedPerson = '';
let matches = [];
let activeMatch = -1;
let toastTimer;

fileInput.addEventListener('change', loadFile);
searchInput.addEventListener('input', debounceSearch);
previousButton.addEventListener('click', () => goToMatch(-1));
nextButton.addEventListener('click', () => goToMatch(1));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && document.activeElement === searchInput && matches.length) {
    event.preventDefault(); goToMatch(event.shiftKey ? -1 : 1);
  }
});

async function loadFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const rawMessages = findMessages(data);
    if (!rawMessages.length) throw new Error('No messages array found');
    messages = rawMessages.slice().sort((a, b) => Number(a.timestamp_ms || 0) - Number(b.timestamp_ms || 0));
    selectedPerson = mostRecentSender(messages);
    searchInput.value = ''; matches = []; activeMatch = -1;
    renderChat(data, file.name);
    emptyState.hidden = true; chat.hidden = false; searchWrap.hidden = false;
    updateSearchControls();
    requestAnimationFrame(() => messagesEl.lastElementChild?.scrollIntoView({ block: 'end' }));
  } catch (error) { showToast(`Could not read this file: ${error.message}.`); }
  event.target.value = '';
}

function findMessages(data) {
  if (Array.isArray(data)) return data.filter(item => item && typeof item === 'object' && ('timestamp_ms' in item || 'content' in item));
  if (Array.isArray(data?.messages)) return data.messages;
  const queue = [data];
  while (queue.length) { const value = queue.shift(); if (!value || typeof value !== 'object') continue; if (Array.isArray(value.messages)) return value.messages; for (const child of Object.values(value)) if (child && typeof child === 'object') queue.push(child); }
  return [];
}

function renderChat(data, fileName) {
  const people = [...new Set(messages.map(m => cleanText(m.sender_name)).filter(Boolean))];
  const title = cleanText(data.title) || fileName.replace(/\.json$/i, '');
  chatInfo.replaceChildren();
  const heading = document.createElement('div');
  heading.innerHTML = `<div class="chat-title"></div><div class="chat-subtitle"></div>`;
  heading.querySelector('.chat-title').textContent = title;
  heading.querySelector('.chat-subtitle').textContent = `${messages.length.toLocaleString()} messages`;
  const select = document.createElement('select'); select.className = 'person-select'; select.title = 'Messages from this person appear on the right';
  people.forEach(person => { const option = new Option(`You: ${person}`, person, false, person === selectedPerson); select.add(option); });
  select.addEventListener('change', () => { selectedPerson = select.value; renderMessages(); });
  chatInfo.append(heading, select); renderMessages();
}

function renderMessages() {
  messagesEl.replaceChildren();
  let lastDay = '';
  messages.forEach((message, index) => {
    const date = new Date(Number(message.timestamp_ms)); const day = date.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    if (day !== lastDay) { const divider = document.createElement('div'); divider.className = 'day-divider'; divider.innerHTML = '<span></span>'; divider.firstChild.textContent = day; messagesEl.append(divider); lastDay = day; }
    messagesEl.append(buildMessage(message, index, date));
  });
  runSearch(false);
}

function buildMessage(message, index, date) {
  const isMine = cleanText(message.sender_name) === selectedPerson;
  const content = cleanText(message.content);
  const row = document.createElement('article'); row.className = `message-row${isMine ? ' mine' : ''}`; row.dataset.index = index;
  if (!content) row.classList.add('has-media');
  const sender = document.createElement('div'); sender.className = 'sender'; sender.textContent = cleanText(message.sender_name) || 'Unknown';
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  bubble.dataset.text = content;
  bubble.textContent = content || mediaDescription(message);
  const time = document.createElement('time'); time.className = 'time'; time.dateTime = date.toISOString(); time.textContent = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  row.append(sender, bubble);
  if (Array.isArray(message.reactions) && message.reactions.length) { const reactions = document.createElement('div'); reactions.className = 'reaction-list'; reactions.title = message.reactions.map(r => `${cleanText(r.actor) || 'Someone'} reacted ${cleanText(r.reaction)}`).join('\n'); reactions.textContent = message.reactions.map(r => cleanText(r.reaction)).join(' '); row.append(reactions); }
  row.append(time); return row;
}

function mediaDescription(message) { if (message.photos?.length) return 'Photo'; if (message.videos?.length) return 'Video'; if (message.audio_files?.length) return 'Audio message'; if (message.share?.link) return message.share.link; if (message.sticker) return 'Sticker'; return 'Message unavailable'; }
function mostRecentSender(items) { return cleanText([...items].reverse().find(m => m.sender_name)?.sender_name); }
function cleanText(value) { const text = String(value ?? ''); if (!/[\u00c2\u00c3\u00f0-\u00ff]/.test(text)) return text; try { const bytes = Uint8Array.from([...text], char => char.charCodeAt(0)); const decoded = new TextDecoder().decode(bytes); return decoded.includes('\ufffd') ? text : decoded; } catch { return text; } }
function allText(value) { if (value == null) return ''; if (typeof value === 'string') return cleanText(value); if (typeof value !== 'object') return String(value); return Object.values(value).map(allText).join(' '); }
let searchTimer;
function debounceSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(true), 120); }
function runSearch(shouldNavigate) {
  const term = searchInput.value.trim().toLocaleLowerCase();
  document.querySelectorAll('.message-row').forEach(row => { row.classList.remove('active-match'); const bubble = row.querySelector('.bubble'); bubble.textContent = bubble.dataset.text || bubble.textContent; });
  matches = term ? messages.map((message, index) => allText(message).toLocaleLowerCase().includes(term) ? index : -1).filter(index => index >= 0) : [];
  activeMatch = matches.length ? 0 : -1;
  if (term) matches.forEach(index => highlightContent(index, term));
  updateSearchControls(); if (shouldNavigate && matches.length) showActiveMatch();
}
function highlightContent(index, term) { const bubble = document.querySelector(`.message-row[data-index="${index}"] .bubble`); const text = bubble.dataset.text; const at = text.toLocaleLowerCase().indexOf(term); if (at < 0) return; bubble.replaceChildren(document.createTextNode(text.slice(0, at)), Object.assign(document.createElement('mark'), { textContent: text.slice(at, at + term.length) }), document.createTextNode(text.slice(at + term.length))); }
function goToMatch(direction) { if (!matches.length) return; activeMatch = (activeMatch + direction + matches.length) % matches.length; showActiveMatch(); updateSearchControls(); }
function showActiveMatch() { document.querySelectorAll('.active-match').forEach(el => el.classList.remove('active-match')); const row = document.querySelector(`.message-row[data-index="${matches[activeMatch]}"]`); row.classList.add('active-match'); row.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function updateSearchControls() { const hasMatches = matches.length > 0; matchCount.textContent = searchInput.value.trim() ? (hasMatches ? `${activeMatch + 1} of ${matches.length}` : 'No matches') : ''; previousButton.disabled = !hasMatches; nextButton.disabled = !hasMatches; }
function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 4200); }
