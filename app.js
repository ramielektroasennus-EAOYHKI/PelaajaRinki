(() => {
  "use strict";

  const SESSION_KEY = "pelaajaringi_v4_session";
  const LEVELS = [
    "Tutustuminen",
    "Aloitteleva",
    "Harrastaja",
    "Harrastaja kilpaa",
    "Kilpapelaaja",
    "Ammattilaispelaaja"
  ];
  const GOALS = [
    "Tuote/palvelu-esittely",
    "Urakoitsijan edustus",
    "Tilaajan edustus",
    "Yhteistyö",
    "Tarjouspyyntö",
    "Varata aika tapaamiselle"
  ];

  const app = document.getElementById("app");
  const state = {
    users: [],
    sessions: [],
    assets: []
  };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function formatDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    return new Intl.DateTimeFormat("fi-FI", {
      weekday: "long",
      day: "numeric",
      month: "numeric"
    }).format(date);
  }

  function setSessionUser(username) {
    window.localStorage.setItem(SESSION_KEY, username);
  }

  function clearSessionUser() {
    window.localStorage.removeItem(SESSION_KEY);
  }

  function getCurrentUsername() {
    return window.localStorage.getItem(SESSION_KEY) || "";
  }

  function getCurrentUser() {
    const current = getCurrentUsername();
    return state.users.find((user) => user.username === current) || null;
  }

  function isProfileComplete(user) {
    if (!user) return false;
    if (user.role === "admin") return true;
    return !!user.level && !!user.company && Array.isArray(user.goals) && user.goals.length > 0;
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      throw new Error(typeof payload === 'string' ? payload : payload.error || 'Toiminto epäonnistui.');
    }

    return payload;
  }

  async function loadState() {
    const data = await fetchJson('/api/app-data');
    state.users = data.users || [];
    state.sessions = data.sessions || [];
    state.assets = data.assets || [];
  }

  function startRealtimeUpdates() {
    if (window.__pelaajaringiEventSource) {
      return;
    }

    if (!('EventSource' in window)) {
      return;
    }

    const source = new EventSource('/api/events');
    source.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'connected') {
          return;
        }
        await loadState();
        const currentUser = getCurrentUser();
        if (currentUser) {
          renderHome();
        }
      } catch (error) {
        console.warn('Realtime update failed:', error);
      }
    };

    source.onerror = () => {
      source.close();
      window.__pelaajaringiEventSource = null;
    };

    window.__pelaajaringiEventSource = source;
  }

  function renderBrandRow(kind) {
    const items = state.assets.filter((asset) => asset.kind === kind);
    if (!items.length) return "";

    return `
      <div class="${kind === 'logo' ? 'brand-list' : 'promo-list'}">
        ${items.map((asset) => {
          const label = asset.link ? `<a href="${escapeHTML(asset.link)}" target="_blank" rel="noopener">${escapeHTML(asset.alt || asset.name)}</a>` : `<span>${escapeHTML(asset.alt || asset.name)}</span>`;
          return `
            <div class="${kind === 'logo' ? 'brand-item' : 'promo-item'}">
              ${asset.imageUrl ? `<img src="${asset.imageUrl}" alt="${escapeHTML(asset.alt || asset.name)}">` : ""}
              <div class="meta-box">${label}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function shell(active) {
    const user = getCurrentUser();
    app.innerHTML = `
      <header class="top">
        <div class="nav">
          <div class="logo">Pelaaja<span>Rinki</span></div>
          <nav class="navlinks">
            <button class="${active === 'home' ? 'active' : ''}" data-go="home">Etusivu</button>
            <button class="${active === 'profile' ? 'active' : ''}" data-go="profile">Oma profiili</button>
            <button class="${active === 'rules' ? 'active' : ''}" data-go="rules">Säännöt</button>
            ${user && user.role === 'admin' ? `<button class="${active === 'admin' ? 'active' : ''}" data-go="admin">Jäsenhallinta</button>` : ''}
            <button class="logout" id="logoutBtn">Kirjaudu ulos</button>
          </nav>
        </div>
      </header>
      <main class="wrap" id="main"></main>
    `;

    document.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => navigate(button.dataset.go));
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
      clearSessionUser();
      renderLogin();
    });
  }

  function renderLogin(message = '') {
    const logos = state.assets.filter((asset) => asset.kind === 'logo');
    const ads = state.assets.filter((asset) => asset.kind === 'ad');

    app.innerHTML = `
      <main class="login-shell">
        <aside class="brand-column">
          <div class="brand-panel">
            <h3>Logoja</h3>
            ${logos.length ? renderBrandRow('logo') : '<div class="empty">Logoja ei ole vielä lisätty.</div>'}
          </div>
        </aside>

        <section class="login-card">
          <div class="rule-bar"></div>
          <div class="eyebrow">Tennis • Padel • Verkostot</div>
          <h1>PelaajaRinki</h1>
          <p><strong>Pelaa. Verkostoidu. Tutustu.</strong></p>
          <p>Viikoittainen maksuton tennis- ja padelrinki rakennus- ja talotekniikka-alan ihmisille.</p>

          <div class="benefit-list">
            <div class="benefit"><strong>Maksuton</strong>Host hoitaa kenttämaksut.</div>
            <div class="benefit"><strong>Peliseura</strong>Jos jäät yksin, Host pelaa kanssasi.</div>
            <div class="benefit"><strong>Rosegarden</strong>Modernit sisäkentät ilman säähuolia.</div>
            <div class="benefit"><strong>Verkostoidu</strong>Tapaa alan ihmisiä rennosti pelin lomassa.</div>
          </div>

          ${message ? `<div class="notice error">${escapeHTML(message)}</div>` : ''}

          <div class="field">
            <label for="loginName">Käyttäjänimi</label>
            <input id="loginName" autocomplete="username" placeholder="Käyttäjänimi">
          </div>

          <div class="field">
            <label for="loginPassword">Salasana</label>
            <input id="loginPassword" type="password" autocomplete="current-password" placeholder="Salasana">
          </div>

          <div class="actions">
            <button class="btn accent" id="loginBtn">Kirjaudu</button>
            <button class="btn secondary" id="registerBtn">Luo uusi jäsen</button>
          </div>

          <div class="sponsor-row">
            <span>Pelipaikkana</span>
            <a href="https://rosegarden.fi/" target="_blank" rel="noopener">Rosegarden</a>
            <span>•</span>
            <span>Yhteistyössä</span>
            <a href="https://elektroasennus.fi/" target="_blank" rel="noopener">Elektroasennus Oy Helsinki</a>
          </div>
        </section>

        <aside class="promo-column">
          <div class="promo-panel">
            <h3>Mainokset</h3>
            ${ads.length ? renderBrandRow('ad') : '<div class="empty">Mainoksia ei ole vielä lisätty.</div>'}
          </div>
        </aside>
      </main>
    `;

    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('registerBtn').addEventListener('click', register);
    document.getElementById('loginPassword').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') login();
    });
  }

  async function login() {
    const username = document.getElementById('loginName').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
      renderLogin('Anna käyttäjänimi ja salasana.');
      return;
    }

    try {
      const response = await fetchJson('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      setSessionUser(response.user.username);
      await loadState();
      renderHome();
    } catch (error) {
      renderLogin(error.message);
    }
  }

  async function register() {
    const username = document.getElementById('loginName').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
      renderLogin('Anna käyttäjänimi ja salasana.');
      return;
    }

    if (username.length < 2) {
      renderLogin('Käyttäjänimessä tulee olla vähintään 2 merkkiä.');
      return;
    }

    try {
      const response = await fetchJson('/api/register', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      setSessionUser(response.user.username);
      await loadState();
      renderProfile();
    } catch (error) {
      renderLogin(error.message);
    }
  }

  function navigate(view) {
    const user = getCurrentUser();
    if (!user) {
      renderLogin();
      return;
    }

    if (view === 'admin' && user.role !== 'admin') {
      view = 'home';
    }

    if (view === 'home') renderHome();
    if (view === 'profile') renderProfile();
    if (view === 'rules') renderRules('sport');
    if (view === 'admin') renderAdmin();
  }

  function sessionCard(session) {
    const user = getCurrentUser();
    const participantRows = session.participants || [];
    const playerRows = participantRows.filter((entry) => {
      const type = entry.type || entry.participant_type || 'play';
      return type !== 'network';
    });
    const networkRows = participantRows.filter((entry) => {
      const type = entry.type || entry.participant_type || 'play';
      return type === 'network';
    });
    const participantNames = participantRows.map((entry) => entry.username || entry);
    const me = participantNames.includes(user?.username);
    const myEntry = participantRows.find((entry) => (entry.username || entry) === user?.username) || null;
    const myType = myEntry?.type || myEntry?.participant_type || 'play';
    const playerCount = playerRows.length;
    const full = playerCount >= session.max;

    if (session.pause) {
      return `
        <article class="card session pausecard">
          <div class="date">${formatDate(session.date)}</div>
          <h3>Tauko-viikko</h3>
          <p class="muted">${escapeHTML(session.description || 'Tällä viikolla ei järjestetä tapahtumaa.')}</p>
          <div class="pill pause">Ei varauksia</div>
        </article>
      `;
    }

    const agendaLines = (session.agenda || '').split('\n').filter((line) => line.trim()).map((line) => `<li>${escapeHTML(line.trim())}</li>`).join('');
    const playerList = playerRows.length ? playerRows.map((entry) => `<span class="participant-chip">${escapeHTML(entry.username || entry)}</span>`).join('') : '<span class="empty-inline">Ei pelaajia</span>';
    const networkList = networkRows.length ? networkRows.map((entry) => `<span class="participant-chip network">${escapeHTML(entry.username || entry)}</span>`).join('') : '<span class="empty-inline">Ei verkostoitumisia</span>';

    return `
      <article class="card session">
        <div>
          <div class="date">${formatDate(session.date)}</div>
          <h3>${escapeHTML(session.sport)} ${escapeHTML(session.time)}–${escapeHTML(session.end)}</h3>
          <p class="muted">${escapeHTML(session.location)}</p>

          <div class="session-metrics">
            <div class="metric">
              <span>Pelaajat kentällä</span>
              <strong>${playerCount} / ${session.max}</strong>
            </div>
            <div class="metric network">
              <span>Verkostot</span>
              <strong>${networkRows.length}</strong>
            </div>
          </div>

          <div class="meta">
            <span class="pill ${full && !me ? 'full' : ''}">${full && !me ? 'Kenttä täynnä' : `${Math.max(session.max - playerCount, 0)} paikkaa vapaana`}</span>
            <span class="pill">Host: ${escapeHTML(session.host)}</span>
          </div>

          ${agendaLines ? `<div class="session-program"><strong>Ohjelma</strong><ul>${agendaLines}</ul></div>` : ''}

          <div class="participants-panel">
            <div class="participant-group">
              <strong>Pelaajat</strong>
              <div class="participant-list">${playerList}</div>
            </div>
            <div class="participant-group network-panel">
              <strong>Verkostot</strong>
              <div class="participant-list">${networkList}</div>
            </div>
          </div>

          ${me ? `<div class="notice success">Olet mukana tässä vuorossa${myType === 'network' ? ' vain verkostoitumistapahtumassa' : ''}.</div>` : ''}
          ${!me && !isProfileComplete(user) ? '<div class="notice">Täydennä profiili ennen ilmoittautumista.</div>' : ''}
          ${!me && full ? '<div class="notice">Kenttä on täynnä pelaajille.</div>' : ''}
        </div>

        <div>
          <label class="network-option">
            <input type="checkbox" data-network-toggle="${session.id}" ${myType === 'network' ? 'checked' : ''} ${me ? 'disabled' : ''}>
            <span>Osallistun vain verkostoitumistapahtumaan</span>
          </label>
          <button class="btn ${me ? 'secondary' : ''}" data-join="${session.id}" ${!me && (!isProfileComplete(user) || full) ? 'disabled' : ''}>${me ? 'Peru osallistuminen' : 'Ilmoittaudu'}</button>
        </div>
      </article>
    `;
  }

  async function toggleParticipation(sessionId, participantType = 'play', action = 'toggle') {
    try {
      const currentUserName = getCurrentUsername();
      if (!currentUserName) return;

      await fetchJson(`/api/sessions/${sessionId}/toggle-participant`, {
        method: 'POST',
        body: JSON.stringify({ username: currentUserName, participantType, action })
      });

      await loadState();
      renderHome();
    } catch (error) {
      alert(error.message);
    }
  }

  function renderHome() {
    shell('home');
    const user = getCurrentUser();
    const main = document.getElementById('main');
    const from = new Date().toISOString().slice(0, 10);
    const toDate = new Date(Date.now() + 62 * 24 * 60 * 60 * 1000);
    const to = toDate.toISOString().slice(0, 10);
    const sessions = state.sessions
      .filter((session) => session.date >= from && session.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));

    main.innerHTML = `
      <section class="hero dark">
        <div class="eyebrow">PelaajaRinki • ${escapeHTML(user.username)}</div>
        <h1>Hyvä peli alkaa hyvästä seurasta.</h1>
        <p class="muted">Rinki yhdistää viikoittaisen mailapelin ja rakennus- sekä talotekniikka-alan verkostoitumisen. Jäsenyys ja osallistuminen ovat maksuttomia.</p>
        <div class="meta">
          <span class="pill">Tennis & Padel</span>
          <span class="pill">Rosegarden</span>
          <span class="pill">8 pelaajaa / vuoro</span>
          <span class="pill">Maksuton</span>
        </div>
      </section>

      ${!isProfileComplete(user) ? `
        <section class="hero">
          <h2>Viimeistele profiilisi</h2>
          <p class="muted">Täydennä pelitaso, yritys ja vähintään yksi verkostoitumistavoite ennen ilmoittautumista.</p>
          <button class="btn accent" id="profileNowBtn">Täydennä profiili</button>
        </section>
      ` : ''}

      <section class="hero">
        <div class="eyebrow">Seuraavat noin 2 kuukautta</div>
        <h2>Pelivuorot</h2>
        <p class="muted">Maksimi on 8 pelaajaa. Varaustilanne näkyy heti.</p>
        <div class="grid two">
          ${sessions.length ? sessions.map((session) => sessionCard(session)).join('') : '<div class="empty">Ei tulevia vuoroja tällä aikavälillä.</div>'}
        </div>
      </section>

      <section class="grid">
        <div class="card">
          <h3>Peliseura joka kerralle</h3>
          <p class="muted">Jokainen vuoro on suunniteltu hyvälle ilmapiirille ja helpolle aloittamiselle – ilman turhaa byrokratiaa.</p>
        </div>
        <div class="card">
          <h3>Huoleton sisäpeli</h3>
          <p class="muted">Rosegarden tarjoaa laadukkaan sisäpeliympäristön, jossa pelaaminen on helpompaa ja keskivertoistakin pelituntia parempi.</p>
        </div>
        <div class="card">
          <h3>Verkostoidu luonnollisesti</h3>
          <p class="muted">Pelin lomassa voi tavata alan ammattilaisia, rakentaa kontakteja ja löytää uusia yhteistyömahdollisuuksia.</p>
        </div>
      </section>
    `;

    document.getElementById('profileNowBtn')?.addEventListener('click', () => renderProfile());
    document.querySelectorAll('[data-join]').forEach((button) => {
      button.addEventListener('click', () => {
        const sessionId = Number(button.dataset.join);
        const networkCheckbox = document.querySelector(`[data-network-toggle="${sessionId}"]`);
        const participantType = networkCheckbox && networkCheckbox.checked ? 'network' : 'play';
        const me = (state.sessions.find((session) => session.id === sessionId)?.participants || []).some((entry) => (entry.username || entry) === getCurrentUsername());

        if (me) {
          toggleParticipation(sessionId, participantType, 'leave');
        } else {
          toggleParticipation(sessionId, participantType, 'join');
        }
      });
    });

    startRealtimeUpdates();
  }

  function renderProfile() {
    shell('profile');
    const user = getCurrentUser();
    const main = document.getElementById('main');

    main.innerHTML = `
      <section class="hero">
        <div class="eyebrow">Oma profiili</div>
        <h1>${escapeHTML(user.username)}</h1>
        <p class="muted">Näitä tietoja käytetään Ringin jäsenhallinnassa ja verkostoitumisen taustana.</p>

        <div class="field">
          <label for="profileLevel">Pelitaso</label>
          <select id="profileLevel">
            <option value="">Valitse</option>
            ${LEVELS.map((level) => `<option value="${escapeHTML(level)}" ${user.level === level ? 'selected' : ''}>${escapeHTML(level)}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label for="profileCompany">Yritys</label>
          <input id="profileCompany" value="${escapeHTML(user.company || '')}" placeholder="Yritys">
        </div>

        <div class="field">
          <label>Verkostoitumisen tavoitteet</label>
          <div class="checkgrid">
            ${GOALS.map((goal) => `
              <label class="check">
                <input type="checkbox" value="${escapeHTML(goal)}" ${Array.isArray(user.goals) && user.goals.includes(goal) ? 'checked' : ''}>
                <span>${escapeHTML(goal)}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <button class="btn accent" id="saveProfileBtn">Tallenna profiili</button>
      </section>
    `;

    document.getElementById('saveProfileBtn').addEventListener('click', async () => {
      const nextLevel = document.getElementById('profileLevel').value;
      const nextCompany = document.getElementById('profileCompany').value.trim();
      const nextGoals = [...document.querySelectorAll('.check input:checked')].map((input) => input.value);

      try {
        await fetchJson('/api/profile', {
          method: 'POST',
          body: JSON.stringify({
            username: user.username,
            level: nextLevel,
            company: nextCompany,
            goals: nextGoals
          })
        });

        await loadState();
        renderHome();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  function renderRules(tab) {
    shell('rules');
    const main = document.getElementById('main');

    main.innerHTML = `
      <section class="hero">
        <div class="eyebrow">Yhteiset ohjeet</div>
        <h1>Säännöt</h1>
        <p class="muted">Selkeät pelisäännöt tekevät Ringistä hyvän ja turvallisen paikan kaikille.</p>

        <div class="tabs">
          <button class="${tab === 'sport' ? 'active' : ''}" data-rule-tab="sport">Lajisäännöt</button>
          <button class="${tab === 'ring' ? 'active' : ''}" data-rule-tab="ring">PelaajaRinki-säännöt</button>
        </div>

        <div id="ruleContent"></div>
      </section>
    `;

    document.querySelectorAll('[data-rule-tab]').forEach((button) => {
      button.addEventListener('click', () => renderRules(button.dataset.ruleTab));
    });

    const content = document.getElementById('ruleContent');

    if (tab === 'sport') {
      content.innerHTML = `
        <h2>Tennis</h2>
        <p class="muted">Lyhyt video tenniksen perussäännöistä ja varsinaisesta matsipelaamisesta.</p>
        <div class="video">
          <span>Alva Tennis – Tenniksen säännöt</span>
          <a href="https://www.youtube.com/watch?v=6-G_80uKQLE" target="_blank" rel="noopener">Katso video</a>
        </div>

        <h2>Padel</h2>
        <p class="muted">Lyhyt video padelin perussäännöistä ja varsinaisesta matsipelaamisesta.</p>
        <div class="video">
          <span>Padel säännöt lyhyesti</span>
          <a href="https://www.youtube.com/watch?v=4vW-d2dIkZ8" target="_blank" rel="noopener">Katso video</a>
        </div>

        <h2>Turvallisuus kentällä</h2>
        ${[
          ['Lämmittele ennen peliä', 'Aloita rauhallisesti ja huomioi oma sekä muiden turvallisuus.'],
          ['Huomioi muut pelaajat', 'Vältä vaarallisia lyöntejä lähellä ja huomioi viereiset kentät.'],
          ['Kysy Hostilta', 'Jos sääntö tai pelitilanne on epäselvä, Host auttaa.']
        ].map(([title, text]) => `<div class="rule"><strong>${escapeHTML(title)}</strong><span class="muted">${escapeHTML(text)}</span></div>`).join('')}
      `;
      return;
    }

    content.innerHTML = [
      ['Tasa-arvoinen kaikille', 'Kaikki ovat tervetulleita, ja kohtelemme toisiamme yhdenvertaisesti.'],
      ['Turvallinen tila', 'Noudatamme turvallisen tilan periaatteita. Häirintää, syrjintää tai epäasiallista käytöstä ei hyväksytä.'],
      ['Kuvaaminen', 'Tapahtumassa ei kuvata muita osallistujia ilman Hostin lupaa.'],
      ['Päihteettömyys', 'PelaajaRinki on päihteetön tapahtuma.'],
      ['Tapahtumapaikan säännöt', 'Rosegardenin omia sääntöjä ja ohjeita noudatetaan kaikissa tilanteissa.'],
      ['Terveenä pelaamaan', 'Ethän tule tapahtumaan sairaana.'],
      ['Ensiapu', 'Tapahtuman ensiavusta ja ensimmäisistä toimenpiteistä vastaa Host yhdessä tapahtumapaikan henkilökunnan kanssa.'],
      ['Muutokset', 'Muutokset tai tapahtuman peruminen ilmoitetaan jäsenille mahdollisimman nopeasti.'],
      ['Ongelmatilanteet', 'Jos tilanne tuntuu epämukavalta tai turvallisuus vaarantuu, kerro siitä Hostille.'],
      ['Osallistuminen ja peruminen', 'Jos et pääsekään paikalle, peru osallistumisesi mahdollisimman ajoissa, jotta paikka vapautuu toiselle jäsenelle.']
    ].map(([title, text]) => `<div class="rule"><strong>${escapeHTML(title)}</strong><span class="muted">${escapeHTML(text)}</span></div>`).join('');
  }

  async function deleteUser(userId) {
    const user = state.users.find((item) => item.id === Number(userId));
    if (!user) return;

    const confirmDelete = window.confirm(`Poistetaanko jäsen ${user.username}?`);
    if (!confirmDelete) return;

    try {
      await fetchJson(`/api/users/${user.id}`, { method: 'DELETE' });
      await loadState();
      renderAdmin();
    } catch (error) {
      alert(error.message);
    }
  }

  async function createUser(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const username = form.username.value.trim();
    const password = form.password.value;
    const role = form.role.value;

    if (!username || !password) {
      alert('Anna käyttäjänimi ja salasana.');
      return;
    }

    try {
      await fetchJson('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role })
      });

      await loadState();
      renderAdmin();
    } catch (error) {
      alert(error.message);
    }
  }

  async function addSession(event) {
    if (event) event.preventDefault();

    const form = event ? event.currentTarget : document.getElementById('sessionForm');
    const date = form.date.value.trim();
    const sport = form.sport.value;
    const time = form.time.value.trim() || '18:00';
    const end = form.endTime.value.trim() || '19:00';
    const location = form.location.value.trim() || 'Rosegarden, Espoo';
    const description = form.description.value.trim() || 'PelaajaRingin viikoittainen pelivuoro.';
    const agenda = form.agenda.value.trim();
    const maxPlayers = Number(form.maxPlayers.value || 8);

    if (!date) {
      alert('Päivämäärä puuttuu.');
      return;
    }

    try {
      await fetchJson('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          date,
          time,
          end,
          sport,
          location,
          host: 'Host',
          description,
          agenda,
          maxPlayers,
          pause: 0
        })
      });
      await loadState();
      renderAdmin();
    } catch (error) {
      alert(error.message);
    }
  }

  async function saveSessionAgenda(sessionId, agenda) {
    try {
      await fetchJson(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        body: JSON.stringify({
          agenda,
          date: state.sessions.find((session) => session.id === sessionId)?.date,
          time: state.sessions.find((session) => session.id === sessionId)?.time,
          end: state.sessions.find((session) => session.id === sessionId)?.end,
          sport: state.sessions.find((session) => session.id === sessionId)?.sport,
          location: state.sessions.find((session) => session.id === sessionId)?.location,
          host: state.sessions.find((session) => session.id === sessionId)?.host,
          description: state.sessions.find((session) => session.id === sessionId)?.description,
          maxPlayers: state.sessions.find((session) => session.id === sessionId)?.max,
          pause: state.sessions.find((session) => session.id === sessionId)?.pause ? 1 : 0
        })
      });
      await loadState();
      renderAdmin();
    } catch (error) {
      alert(error.message);
    }
  }

  async function addPause(event) {
    if (event) event.preventDefault();

    const form = event ? event.currentTarget : document.getElementById('pauseForm');
    const date = form.date.value.trim();
    const description = form.description.value.trim() || 'Tauko-viikko – ei PelaajaRinki-tapahtumaa.';

    if (!date) {
      alert('Tauko-viikon päivämäärä puuttuu.');
      return;
    }

    try {
      await fetchJson('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          date,
          time: '',
          end: '',
          sport: 'Tauko',
          location: 'Rosegarden, Espoo',
          host: 'Host',
          description,
          maxPlayers: 0,
          pause: 1
        })
      });
      await loadState();
      renderAdmin();
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteSession(sessionId) {
    const confirmDelete = window.confirm('Poistetaanko tämä vuoro tai tauko?');
    if (!confirmDelete) return;

    try {
      await fetchJson(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      await loadState();
      renderAdmin();
    } catch (error) {
      alert(error.message);
    }
  }

  async function uploadBrandAsset(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get('image');

    if (!file || !file.name) {
      alert('Valitse kuva ennen lähettämistä.');
      return;
    }

    try {
      const response = await fetch('/api/assets', {
        method: 'POST',
        body: formData
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Kuvan lähettäminen epäonnistui.');
      }

      await loadState();
      renderAdmin();
    } catch (error) {
      alert(error.message || 'Kuvan lähettäminen epäonnistui.');
    }
  }

  async function deleteAsset(assetId) {
    const confirmDelete = window.confirm('Poistetaanko logo tai mainos?');
    if (!confirmDelete) return;

    try {
      await fetchJson(`/api/assets/${assetId}`, { method: 'DELETE' });
      await loadState();
      renderAdmin();
    } catch (error) {
      alert(error.message);
    }
  }

  function renderAdmin() {
    shell('admin');
    const main = document.getElementById('main');
    const members = state.users.filter((item) => item.role !== 'admin');
    const futureSessions = state.sessions
      .filter((session) => session.date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.date.localeCompare(b.date));

    main.innerHTML = `
      <section class="hero">
        <div class="eyebrow">Admin</div>
        <h1>Jäsenhallinta</h1>
        <p class="muted">Yleiskatsaus jäsenistä, vuoroista ja brändimateriaaleista.</p>

        <form id="createUserForm" class="admin-form">
          <h3>Luo uusi käyttäjä</h3>
          <div class="field-row">
            <div class="field">
              <label for="newUserName">Käyttäjänimi</label>
              <input id="newUserName" name="username" placeholder="Esim. janne" required>
            </div>
            <div class="field">
              <label for="newUserPassword">Salasana</label>
              <input id="newUserPassword" name="password" type="password" placeholder="Salasana" required>
            </div>
            <div class="field">
              <label for="newUserRole">Rooli</label>
              <select id="newUserRole" name="role">
                <option value="user">Käyttäjä</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button class="btn accent" type="submit">Lisää käyttäjä</button>
        </form>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Käyttäjä</th>
                <th>Yritys</th>
                <th>Taso</th>
                <th>Tavoitteet</th>
                <th>Toiminnot</th>
              </tr>
            </thead>
            <tbody>
              ${members.length ? members.map((member) => `
                <tr>
                  <td><strong>${escapeHTML(member.username)}</strong></td>
                  <td>${escapeHTML(member.company || '—')}</td>
                  <td>${escapeHTML(member.level || '—')}</td>
                  <td>${member.goals && member.goals.length ? member.goals.map((goal) => escapeHTML(goal)).join(', ') : '—'}</td>
                  <td><button class="btn danger" data-user-delete="${member.id}">Poista</button></td>
                </tr>
              `).join('') : '<tr><td colspan="5">Ei muita jäseniä.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="hero">
        <div class="eyebrow">Seuraavat viikot</div>
        <h2>Vuorot ja tauot</h2>

        <form id="sessionForm" class="admin-form">
          <h3>Lisää vuoro</h3>
          <div class="field-row">
            <div class="field">
              <label for="sessionDate">Päivämäärä</label>
              <input id="sessionDate" name="date" type="date" value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}" required>
            </div>
            <div class="field">
              <label for="sessionSport">Laji</label>
              <select id="sessionSport" name="sport">
                <option value="Tennis">Tennis</option>
                <option value="Padel">Padel</option>
              </select>
            </div>
            <div class="field">
              <label for="sessionTime">Alkaa</label>
              <input id="sessionTime" name="time" type="time" value="18:00">
            </div>
            <div class="field">
              <label for="sessionEndTime">Loppuu</label>
              <input id="sessionEndTime" name="endTime" type="time" value="19:00">
            </div>
            <div class="field">
              <label for="sessionMaxPlayers">Pelaajia</label>
              <input id="sessionMaxPlayers" name="maxPlayers" type="number" min="1" max="16" value="8">
            </div>
          </div>
          <div class="field-row">
            <div class="field" style="flex: 2;">
              <label for="sessionLocation">Sijainti</label>
              <input id="sessionLocation" name="location" value="Rosegarden, Espoo">
            </div>
            <div class="field" style="flex: 2;">
              <label for="sessionDescription">Kuvaus</label>
              <input id="sessionDescription" name="description" value="PelaajaRingin viikoittainen pelivuoro.">
            </div>
          </div>
          <div class="field">
            <label for="sessionAgenda">Ohjelma / kellonajat</label>
            <textarea id="sessionAgenda" name="agenda" placeholder="Esim. 18:00 Tarkastus&#10;18:15 Peli 1&#10;19:00 Verkostointi"></textarea>
          </div>
          <button class="btn accent" type="submit">Tallenna vuoro</button>
        </form>

        <form id="pauseForm" class="admin-form">
          <h3>Lisää taukoviikko</h3>
          <div class="field-row">
            <div class="field">
              <label for="pauseDate">Päivämäärä</label>
              <input id="pauseDate" name="date" type="date" value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}" required>
            </div>
            <div class="field" style="flex: 2;">
              <label for="pauseDescription">Kuvaus</label>
              <input id="pauseDescription" name="description" value="Tauko-viikko – ei PelaajaRinki-tapahtumaa.">
            </div>
          </div>
          <button class="btn secondary" type="submit">Tallenna taukoviikko</button>
        </form>

        <div class="grid two">
          ${futureSessions.length ? futureSessions.map((session) => {
            const playerParticipants = (session.participants || []).filter((entry) => (entry.type || entry.participant_type || 'play') !== 'network');
            const networkParticipants = (session.participants || []).filter((entry) => (entry.type || entry.participant_type || 'play') === 'network');
            return `
              <div class="card">
                <div class="date">${formatDate(session.date)}</div>
                <h3>${session.pause ? 'Tauko-viikko' : `${escapeHTML(session.sport)} ${escapeHTML(session.time)}`}</h3>
                <p class="muted">
                  ${session.pause ? escapeHTML(session.description || 'Tauko-viikko') : `${playerParticipants.length} / ${session.max} pelaajaa · Host: ${escapeHTML(session.host)}`}
                </p>
                ${!session.pause ? `
                  <div class="admin-participants">
                    <div class="mini-group">
                      <strong>Pelaajat kentällä</strong>
                      <div>${playerParticipants.length ? playerParticipants.map((entry) => `<span class="participant-chip">${escapeHTML(entry.username || entry)}</span>`).join('') : '<span class="empty-inline">Ei pelaajia</span>'}</div>
                    </div>
                    <div class="mini-group network-panel">
                      <strong>Verkostot</strong>
                      <div>${networkParticipants.length ? networkParticipants.map((entry) => `<span class="participant-chip network">${escapeHTML(entry.username || entry)}</span>`).join('') : '<span class="empty-inline">Ei verkostoitumisia</span>'}</div>
                    </div>
                  </div>
                ` : ''}
                ${!session.pause ? `<div class="field"><label>Ohjelma / kellonajat</label><textarea data-session-agenda="${session.id}">${escapeHTML(session.agenda || '')}</textarea><button class="btn secondary" data-save-agenda="${session.id}" style="margin-top:10px;">Tallenna ohjelma</button></div>` : ''}
                <button class="btn danger" style="margin-top: 12px;" data-delete-session="${session.id}">Poista</button>
              </div>
            `;
          }).join('') : '<div class="empty">Ei tulevia vuoroja.</div>'}
        </div>
      </section>

      <section class="hero">
        <div class="eyebrow">Branding</div>
        <h2>Logo ja mainokset</h2>
        <p class="muted">Lisää kuvamateriaalia, joka näkyy käyttäjille kirjautumissivulta alkaen. Jätä sijoittelu selkeäksi ja käyttömukavuuden säilyttäen.</p>

        <form id="assetForm" class="asset-form">
          <div class="field">
            <label for="assetKind">Tyyppi</label>
            <select id="assetKind" name="kind">
              <option value="logo">Logo</option>
              <option value="ad">Mainos</option>
            </select>
          </div>

          <div class="field">
            <label for="assetName">Nimi</label>
            <input id="assetName" name="name" placeholder="Esim. Rosegarden">
          </div>

          <div class="field full">
            <label for="assetLink">Linkki (valinnainen)</label>
            <input id="assetLink" name="link" placeholder="https://example.com">
          </div>

          <div class="field full">
            <label for="assetImage">Kuva</label>
            <input id="assetImage" name="image" type="file" accept="image/*" required>
          </div>

          <div class="field full">
            <button class="btn accent" type="submit">Lähetä kuva</button>
          </div>
        </form>

        <div class="asset-grid">
          ${state.assets.length ? state.assets.map((asset) => `
            <div class="asset-card">
              ${asset.imageUrl ? `<img src="${asset.imageUrl}" alt="${escapeHTML(asset.alt || asset.name)}">` : ''}
              <div class="meta-box">
                <div><strong>${escapeHTML(asset.kind === 'logo' ? 'Logo' : 'Mainos')}</strong></div>
                <div>${escapeHTML(asset.name || asset.alt || 'Brand')}</div>
                ${asset.link ? `<div><a href="${escapeHTML(asset.link)}" target="_blank" rel="noopener">Avaa linkki</a></div>` : ''}
                <button class="btn danger" style="margin-top: 12px;" data-delete-asset="${asset.id}">Poista</button>
              </div>
            </div>
          `).join('') : '<div class="empty" style="grid-column: 1 / -1;">Ei vielä lisättyjä logoja tai mainoksia.</div>'}
        </div>
      </section>
    `;

    document.getElementById('createUserForm').addEventListener('submit', createUser);
    document.getElementById('sessionForm').addEventListener('submit', addSession);
    document.getElementById('pauseForm').addEventListener('submit', addPause);
    document.getElementById('assetForm').addEventListener('submit', uploadBrandAsset);

    document.querySelectorAll('[data-user-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteUser(Number(button.dataset.userDelete)));
    });

    document.querySelectorAll('[data-delete-session]').forEach((button) => {
      button.addEventListener('click', () => deleteSession(Number(button.dataset.deleteSession)));
    });

    document.querySelectorAll('[data-save-agenda]').forEach((button) => {
      button.addEventListener('click', () => {
        const textarea = document.querySelector(`[data-session-agenda="${button.dataset.saveAgenda}"]`);
        if (textarea) {
          saveSessionAgenda(Number(button.dataset.saveAgenda), textarea.value);
        }
      });
    });

    document.querySelectorAll('[data-delete-asset]').forEach((button) => {
      button.addEventListener('click', () => deleteAsset(Number(button.dataset.deleteAsset)));
    });
  }

  async function bootstrap() {
    try {
      await loadState();
      const user = getCurrentUser();
      if (user) {
        renderHome();
      } else {
        renderLogin();
      }
    } catch (error) {
      renderLogin(error.message);
    }
  }

  window.PelaajaRinki = {
    reset: async () => {
      window.localStorage.removeItem(SESSION_KEY);
      try {
        await fetch('/api/reset', { method: 'POST' });
      } catch (error) {
        console.warn('Reset API not available in this environment', error);
      }
      window.location.reload();
    }
  };

  bootstrap();
})();