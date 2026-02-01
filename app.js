/* ======================================================
   Louvor PRO — App principal
   ✅ Admin protegido por senha (Netlify Identity)
   ✅ Publicação para todos sem deploy (Netlify Functions + Blobs)
   - Admin edita em rascunho local e clica "Publicar"
   - Membros veem sempre o "Publicado" (remoto)
====================================================== */

(function(){
  const LS_DRAFT_KEY = () => `louvorpro:draft:${APP_CONFIG.monthKey}`;
  const LS_AVISOS_KEY = "avisos_louvor";
  const LS_APAGADOS_KEY = "avisos_raiz_apagados";

  const REMOTE_ENDPOINT = (APP_CONFIG.remoteApi && APP_CONFIG.remoteApi.startsWith("/"))
    ? APP_CONFIG.remoteApi
    : "/api/data";

  let identityUser = null; // Netlify Identity user (quando logado)
  let isAdmin = false;
  let remoteMeta = null; // { updatedAt, updatedBy }

  // ✅ Regra de permissão:
  // - Só pode editar/publicar quem tiver role "admin" ou "editor" no Netlify Identity
  //   (definido manualmente por você no painel do Netlify), OU quem estiver na lista
  //   de e-mails permitidos.
  // - Para facilitar, mantemos um fallback com seu e-mail.
  const FALLBACK_ADMIN_EMAILS = ["fabio.tec.audio@hotmail.com"]; // altere se quiser

  function getUserRoles(user){
    try {
      return (user?.app_metadata?.roles || user?.token?.access_token?.app_metadata?.roles || []) || [];
    } catch(_) { return []; }
  }

  function isEditorUser(user){
    if (!user) return false;
    const email = (user.email || "").toLowerCase();
    const roles = user.app_metadata?.roles || [];
    const allowedEmails = (APP_CONFIG?.adminEmails && Array.isArray(APP_CONFIG.adminEmails))
      ? APP_CONFIG.adminEmails.map(e => (e||"").toLowerCase())
      : FALLBACK_ADMIN_EMAILS;
    const roleOk = roles.includes("admin") || roles.includes("editor");
    const emailOk = allowedEmails.includes(email);
    return roleOk || emailOk;
  }

  function setAdminState(on){
    isAdmin = !!on;
    document.body.classList.toggle("is-admin", isAdmin);
    const btnLogin = document.getElementById("btn-login");
    const btnLogout = document.getElementById("btn-logout");
    // 🔒 Para usuários comuns: escondemos 100% qualquer UI de edição.
    // O login do Admin é aberto por gesto (toques no logo), então o botão de login
    // fica sempre oculto.
    if (btnLogin) btnLogin.style.display = "none";
    if (btnLogout) btnLogout.style.display = isAdmin ? "" : "none";
  }

  function getAuthToken(){
    try {
      const u = window.netlifyIdentity?.currentUser?.();
      return u?.token?.access_token || null;
    } catch(_) { return null; }
  }

  function initIdentity(){
    const ni = window.netlifyIdentity;
    const btnLogin = document.getElementById("btn-login");
    const btnLogout = document.getElementById("btn-logout");

    if (!ni) {
      // Sem Identity (ex.: abriu localmente). Admin fica desativado.
      if (btnLogin) btnLogin.style.display = "none";
      if (btnLogout) btnLogout.style.display = "none";
      setAdminState(false);
      return;
    }

    // Default: não logado
    setAdminState(false);

    // Botões ficam ocultos (login por gesto). Logout só aparece para editor/admin.
    if (btnLogin) btnLogin.style.display = "none";
    if (btnLogout) btnLogout.onclick = () => ni.logout();

    // ✅ GESTO PARA ABRIR LOGIN (sem mostrar UI de edição para quem não é editor)
    // Toque 7x no LOGO em até 2,5s para abrir a tela de login.
    const logo = document.querySelector(".logo-img");
    if (logo) {
      let taps = 0;
      let t0 = 0;
      logo.addEventListener("click", () => {
        const now = Date.now();
        if (!t0 || (now - t0) > 2500) { taps = 0; t0 = now; }
        taps += 1;
        if (taps >= 7) {
          taps = 0;
          ni.open("login");
        }
      });
    }

    ni.on("init", (user) => {
      identityUser = user || null;
      const canEdit = isEditorUser(identityUser);
      setAdminState(!!canEdit);
      // Se estava logado e tem permissão, carrega rascunho/controles
      if (identityUser && canEdit) loadData().then(renderAll);
    });
    ni.on("login", (user) => {
      identityUser = user;
      const canEdit = isEditorUser(identityUser);
      if (!canEdit) {
        // Não-editor: não mostra nada de edição e já desloga para evitar confusão.
        setAdminState(false);
        ni.close();
        setTimeout(() => {
          alert("Seu usuário não tem permissão de edição.\nPeça ao administrador para liberar a role editor/admin.");
          ni.logout();
        }, 50);
        return;
      }

      setAdminState(true);
      ni.close();
      // Recarrega dados: agora pode ter rascunho local + botões de publicar
      loadData().then(renderAll);
    });
    ni.on("logout", () => {
      identityUser = null;
      setAdminState(false);
      // Ao sair, limpa rascunho do admin? Não. Apenas volta a mostrar o publicado.
      loadData().then(renderAll);
    });

    ni.init();
    // Se já estiver logado, currentUser() resolve após init.
  }

  // ---------------------------
  // Utilidades
  // ---------------------------
  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
  const byId = (id) => document.getElementById(id);

  const toast = (msg) => {
    // simples: usa alert apenas em admin
    if (isAdmin) alert(msg);
  };

  const norm = (s) => (s||"").toString().trim();
  const pad2 = (n) => String(n).padStart(2,"0");
  const parseBRDate = (ddmm) => {
    const [d,m] = (ddmm||"").split("/").map(x=>parseInt(x,10));
    if (!d || !m) return null;
    return { d, m };
  };
  const sortByDate = (a,b) => {
    const pa=parseBRDate(a.data||a), pb=parseBRDate(b.data||b);
    if(!pa || !pb) return 0;
    if(pa.m!==pb.m) return pa.m-pb.m;
    return pa.d-pb.d;
  };

  const funcIcon = (key) => (FUNCOES.find(f=>f.key===key)?.icon) || "•";

  const memberById = (id) => currentData.membros.find(m=>m.id===id);
  const memberHasFunc = (m, funcKey) => (m.funcoes||[]).includes(funcKey);
  const shortName = (m) => {
    if (!m) return "";
    // Prefer apelido (ex: "Fer"), senão usa o nome completo
    if (m.apelido) return m.apelido;
    return m.nome;
  };

  

// Ícones por função (para deixar as escalas mais legíveis no celular)
const ROLE_ICON = {
  "Bateria": "🥁",
  "Baixo": "🎸",
  "Guitarra": "🎸",
  "Violão": "🪕",
  "Teclado": "🎹",
  "Vocais": "🎤",
  "Equipe": "💃",
  "Coreo": "📝",
  "Mídia": "📸",
  "Projetor": "💻",
  "PA": "🎛",
  "Monitor": "🎧",
  "Talkback": "📢"
};

const driveOpen = (idOrUrl) => {
    const u = norm(idOrUrl);
    if (!u || u==="#") return "#";
    // Se for ID puro:
    if (!u.includes("/") && !u.includes("http")) return `https://drive.google.com/open?id=${u}`;
    // Extrai ID de /file/d/ID
    const m1 = u.match(/\/file\/d\/([^/]+)/);
    if (m1 && m1[1]) return `https://drive.google.com/open?id=${m1[1]}`;
    // Extrai ?id=
    const m2 = u.match(/[?&]id=([^&]+)/);
    if (m2 && m2[1]) return `https://drive.google.com/open?id=${m2[1]}`;
    return u;
  };

  // ---------------------------
  // Dados (carregamento/salvamento)
  // ---------------------------
  let currentData = deepClone(DEFAULT_DATA);

  async function fetchRemote(){
    remoteMeta = null;
    try {
      const url = `${REMOTE_ENDPOINT}?monthKey=${encodeURIComponent(APP_CONFIG.monthKey)}&v=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const payload = await res.json();
      if (!payload || typeof payload !== "object") return;

      // Formato esperado: { data: <obj>, meta: { updatedAt, updatedBy } }
      const data = payload.data ?? payload;
      if (data && typeof data === "object") {
        currentData = data;
      }
      remoteMeta = payload.meta ?? null;
    } catch(_) {}
  }

  async function loadData(){
    // 1) base
    currentData = deepClone(DEFAULT_DATA);

    // 2) publicado (remoto) — todos recebem
    await fetchRemote();

    // 3) rascunho local (somente admin)
    if (isAdmin) {
      try {
        const raw = localStorage.getItem(LS_DRAFT_KEY());
        if (raw) {
          const local = JSON.parse(raw);
          if (local && typeof local === "object") currentData = local;
        }
      } catch(_) {}
    }
  }

  function saveData(){
    if (!isAdmin) return;
    try {
      localStorage.setItem(LS_DRAFT_KEY(), JSON.stringify(currentData));
    } catch(e) { toast("Não foi possível salvar. Memória do navegador cheia?"); }
  }

  function clearDraft(){
    try { localStorage.removeItem(LS_DRAFT_KEY()); } catch(_) {}
  }

  async function publishRemote(){
    if (!isAdmin) return toast("Você precisa estar logado como Admin.");
    const token = getAuthToken();
    if (!token) return toast("Login do Admin não encontrado. Clique em Entrar (Admin).");

    try {
      const url = `${REMOTE_ENDPOINT}?monthKey=${encodeURIComponent(APP_CONFIG.monthKey)}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(currentData)
      });

      if (!res.ok) {
        const txt = await res.text().catch(()=>"");
        return toast(`Falha ao publicar (${res.status}). ${txt}`);
      }

      // Após publicar: limpa rascunho e recarrega o publicado
      clearDraft();
      await loadData();
      await renderAll();
      toast("Publicado ✅ (todos vão ver)");
    } catch(e) {
      toast("Falha ao publicar. Verifique se as Functions estão ativas no Netlify.");
    }
  }

  // ---------------------------
  // Modal genérico
  // ---------------------------
  function openModal(html){
    const modal = byId("ui-modal");
    const wrap = byId("ui-modal-wrap");
    wrap.innerHTML = html;
    modal.style.display = "flex";
  }
  function closeModal(){
    const modal = byId("ui-modal");
    const wrap = byId("ui-modal-wrap");
    wrap.innerHTML = "";
    modal.style.display = "none";
  }
  window.__closeModal = closeModal;

  // ---------------------------
  // Header
  // ---------------------------
  function renderHeader(){
    byId("hdr-title").textContent = APP_CONFIG.ministerio;
    byId("hdr-sub").innerHTML = `<i class="far fa-calendar-alt"></i> ${APP_CONFIG.mesNome} ${APP_CONFIG.ano} • ${APP_CONFIG.subtitulo}`;
    byId("uniformes-title").textContent = currentData.titulos.uniformesTitulo || `PADRÃO VISUAL - ${APP_CONFIG.mesNome}`;
    byId("ensaios-title").innerHTML = `<i class="fas fa-clock"></i> ${currentData.titulos.ensaiosTitulo || "CRONOGRAMA DE ESTUDO"}`;
    byId("ensaios-subtitle").textContent = currentData.titulos.ensaiosSubtitulo || "";
    byId("discipulado-title").textContent = currentData.titulos.discipuladoTitulo || "📖 Texto base do estudo";
    byId("discipulado-subtitle").textContent = currentData.titulos.discipuladoSubtitulo || "";
  }

  // ---------------------------
  // Navegação (1 única)
  // ---------------------------
  function initTabs(){
    document.querySelectorAll(".tab").forEach(tab => {
      const isAdminTab = tab.classList.contains("admin-only");
      tab.style.display = (isAdmin || !isAdminTab) ? "" : "none";
    });

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

        tab.classList.add('active');
        const destino = tab.getAttribute('data-tab');
        const secaoAlvo = document.getElementById(destino);
        if (secaoAlvo) secaoAlvo.classList.add('active');

        if(destino === 'notificacoes') {
          const badge = document.getElementById('notif-badge');
          if(badge) badge.style.display = 'none';
        }
      });
    });
  }

  // ---------------------------
  // Subnav badges (Escalas + Info)
  // ---------------------------
  function initBadges(){
    document.querySelectorAll('#escalas-subs .badge').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#escalas-subs .badge').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderEscalas(b.dataset.type);
      };
    });

    document.querySelectorAll('#info-subs .badge').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#info-subs .badge').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderInfo(b.dataset.info);
      };
    });
  }

  // ---------------------------
  // Escalas (visual + editor por função)
  // ---------------------------
  function renderEscalas(type){
    const container = byId("escala-render-area");
    const data = currentData.escalas[type] || [];
    data.sort(sortByDate);

    let html = "";
    data.forEach(item => {
      html += `<div class="escala-mobile-item">
        <div class="escala-date-row">${item.data}</div>`;

      const campos = ESCALA_CAMPOS[type] || [];
      campos.forEach(c => {
        const key = c.key;
        const slots = item.slots || {};
        let valHtml = `<span class="value"><span class="sep">—</span></span>`;

        if (c.type === "text") {
          const v = norm(slots[key] || "");
          valHtml = `<span class="value">${v || '<span class="sep">—</span>'}</span>`;
        } else if (c.type === "equipe") {
          const v = norm(slots[key] || "");
          valHtml = `<span class="value">${v || '<span class="sep">—</span>'}</span>`;
        } else if (c.multi) {
          const arr = Array.isArray(slots[key]) ? slots[key] : [];
          const names = arr.map(id => shortName(memberById(id))).filter(Boolean);
          valHtml = `<span class="value">${names.length ? names.join(" - ") : "<span class='sep'>—</span>"}</span>`;
        } else {
          const id = slots[key];
          const m = id ? memberById(id) : null;
          valHtml = `<span class="value">${m ? `<span class="name">${shortName(m)}</span>` : '<span class="sep">—</span>'}</span>`;
        }

        const clickAttr = (isAdmin && (c.type !== "text")) ? `data-edit="1" data-esc-type="${type}" data-esc-date="${item.data}" data-esc-key="${key}"` : "";
        const icon = ROLE_ICON[key] || "";
        const keyLabel = icon ? `${key}${icon}` : key;
        html += `<div class="escala-info-row field-row" ${clickAttr}>
          <span class="escala-key">${keyLabel}</span>
          <span class="colon">:</span>
          ${valHtml}
        </div>`;
      });

      html += `</div>`;
    });

    // botão add data (admin)
    if (isAdmin) {
      html = `<div class="edit-hint">🛠️ Modo Admin: toque em uma função para escolher pessoas • <button class="small-btn primary" id="btn-add-date">+ Adicionar data</button></div>` + html;
    }

    container.innerHTML = html;

    // listeners admin
    if (isAdmin) {
      const btn = byId("btn-add-date");
      if (btn) btn.onclick = () => addEscalaDate(type);

      container.querySelectorAll("[data-edit='1']").forEach(el => {
        el.onclick = () => {
          const t = el.getAttribute("data-esc-type");
          const d = el.getAttribute("data-esc-date");
          const k = el.getAttribute("data-esc-key");
          openEscalaPicker(t,d,k);
        };
      });
    }
  }

  function addEscalaDate(type){
    openModal(`
      <div class="modal-card">
        <div class="modal-title">Adicionar data — ${type.toUpperCase()} <button class="modal-close" onclick="__closeModal()"><i class="fas fa-times"></i></button></div>
        <div class="grid-2">
          <div>
            <label class="escala-label">Data (DD/MM)</label>
            <input id="new-date" class="input" placeholder="ex: 05/02">
          </div>
          <div>
            <label class="escala-label">Horário (opcional)</label>
            <input id="new-time" class="input" placeholder="(não usado nas escalas)">
          </div>
        </div>
        <div style="margin-top:12px; display:flex; gap:10px;">
          <button class="small-btn primary" id="btn-save">Salvar</button>
          <button class="small-btn" onclick="__closeModal()">Cancelar</button>
        </div>
        <div class="edit-hint">Dica: depois de criar, toque nas funções para preencher.</div>
      </div>
    `);

    byId("btn-save").onclick = () => {
      const ddmm = norm(byId("new-date").value);
      if (!/^\d{2}\/\d{2}$/.test(ddmm)) return toast("Digite a data no formato DD/MM");
      const entry = { data: ddmm, slots: {} };

      // init slots
      (ESCALA_CAMPOS[type]||[]).forEach(c=>{
        if (c.type === "text") entry.slots[c.key] = "";
        else if (c.type === "equipe") entry.slots[c.key] = "";
        else if (c.multi) entry.slots[c.key] = [];
        else entry.slots[c.key] = "";
      });

      currentData.escalas[type] = currentData.escalas[type] || [];
      currentData.escalas[type].push(entry);
      saveData();
      closeModal();
      renderEscalas(type);
      renderMembros(); // recalcula "minhas escalas"
    };
  }

  function openEscalaPicker(type, dateStr, key){
    const campos = (ESCALA_CAMPOS[type]||[]);
    const campo = campos.find(c=>c.key===key) || {};
    const isMulti = !!campo.multi;

    // Dance equipe picker
    if (type === "danca" && key === "Equipe") {
      const current = getEscalaSlot(type,dateStr,key);
      openModal(`
        <div class="modal-card">
          <div class="modal-title">Equipe — ${dateStr} <button class="modal-close" onclick="__closeModal()"><i class="fas fa-times"></i></button></div>
          <div class="list-item" data-val="Equipe A">
            <div class="left"><div class="top">Equipe A 💃</div><div class="sub">Seleciona automaticamente todos que têm a função "Equipe A"</div></div>
            <div>${current==="Equipe A" ? "✅" : ""}</div>
          </div>
          <div class="list-item" data-val="Equipe B">
            <div class="left"><div class="top">Equipe B 💃</div><div class="sub">Seleciona automaticamente todos que têm a função "Equipe B"</div></div>
            <div>${current==="Equipe B" ? "✅" : ""}</div>
          </div>
          <hr class="sep">
          <button class="small-btn danger" id="btn-clear">Limpar</button>
        </div>
      `);

      document.querySelectorAll(".list-item[data-val]").forEach(li=>{
        li.onclick = () => {
          const v = li.getAttribute("data-val");
          setEscalaSlot(type,dateStr,key,v);
          saveData(); closeModal();
          renderEscalas(type); renderMembros();
        };
      });
      byId("btn-clear").onclick = () => {
        setEscalaSlot(type,dateStr,key,"");
        saveData(); closeModal();
        renderEscalas(type); renderMembros();
      };
      return;
    }

    // Text field edit
    if (type === "danca" && key === "Coreo") {
      const current = getEscalaSlot(type,dateStr,key) || "";
      openModal(`
        <div class="modal-card">
          <div class="modal-title">Coreo — ${dateStr} <button class="modal-close" onclick="__closeModal()"><i class="fas fa-times"></i></button></div>
          <label class="escala-label">Texto</label>
          <input id="coreo" class="input" value="${escapeHtml(current)}" placeholder="ex: Livre / Coreografia X">
          <div style="margin-top:12px; display:flex; gap:10px;">
            <button class="small-btn primary" id="btn-save">Salvar</button>
            <button class="small-btn danger" id="btn-clear">Limpar</button>
          </div>
        </div>
      `);
      byId("btn-save").onclick = () => {
        setEscalaSlot(type,dateStr,key,norm(byId("coreo").value));
        saveData(); closeModal();
        renderEscalas(type);
      };
      byId("btn-clear").onclick = () => {
        setEscalaSlot(type,dateStr,key,"");
        saveData(); closeModal();
        renderEscalas(type);
      };
      return;
    }

    // candidatos por função
    const candidates = currentData.membros
      .filter(m => memberHasFunc(m, key))
      .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));

    const currentVal = getEscalaSlot(type,dateStr,key);

    const header = `<div class="modal-title">${key} — ${dateStr} <button class="modal-close" onclick="__closeModal()"><i class="fas fa-times"></i></button></div>`;

    if (!isMulti) {
      const items = candidates.map(m=>{
        const checked = (currentVal === m.id) ? "✅" : "";
        return `<div class="list-item" data-id="${m.id}">
          <div class="left">
            <div class="top">${m.nome}</div>
            <div class="sub">${m.funcoes.join(" • ")}</div>
          </div>
          <div>${checked}</div>
        </div>`;
      }).join("");

      openModal(`
        <div class="modal-card">
          ${header}
          ${items || `<div class="edit-hint">Nenhum membro cadastrado com a função "${key}". Vá em <b>Admin → Membros</b> e marque a função.</div>`}
          <hr class="sep">
          <button class="small-btn danger" id="btn-clear">Remover</button>
        </div>
      `);

      document.querySelectorAll(".list-item[data-id]").forEach(li=>{
        li.onclick = () => {
          const id = li.getAttribute("data-id");
          setEscalaSlot(type,dateStr,key,id);
          saveData(); closeModal();
          renderEscalas(type); renderMembros();
        };
      });
      byId("btn-clear").onclick = () => {
        setEscalaSlot(type,dateStr,key,"");
        saveData(); closeModal();
        renderEscalas(type); renderMembros();
      };
      return;
    }

    // Multi (Vocais)
    const curArr = Array.isArray(currentVal) ? currentVal : [];
    const items = candidates.map(m=>{
      const on = curArr.includes(m.id);
      return `<div class="list-item" data-id="${m.id}">
        <div class="left">
          <div class="top">${m.nome}</div>
          <div class="sub">${m.funcoes.join(" • ")}</div>
        </div>
        <div>${on ? "✅" : ""}</div>
      </div>`;
    }).join("");

    openModal(`
      <div class="modal-card">
        ${header}
        <div class="edit-hint">Toque para adicionar/remover. (multi-seleção)</div>
        ${items || `<div class="edit-hint">Nenhum membro cadastrado com a função "${key}". Vá em <b>Admin → Membros</b> e marque a função.</div>`}
        <hr class="sep">
        <button class="small-btn danger" id="btn-clear">Limpar lista</button>
      </div>
    `);

    document.querySelectorAll(".list-item[data-id]").forEach(li=>{
      li.onclick = () => {
        const id = li.getAttribute("data-id");
        const now = Array.isArray(getEscalaSlot(type,dateStr,key)) ? getEscalaSlot(type,dateStr,key) : [];
        const next = now.includes(id) ? now.filter(x=>x!==id) : [...now, id];
        setEscalaSlot(type,dateStr,key,next);
        saveData();
        // re-render modal quickly (simple: close & open again)
        closeModal();
        openEscalaPicker(type,dateStr,key);
        renderEscalas(type); renderMembros();
      };
    });
    byId("btn-clear").onclick = () => {
      setEscalaSlot(type,dateStr,key,[]);
      saveData(); closeModal();
      renderEscalas(type); renderMembros();
    };
  }

  function getEscalaSlot(type, dateStr, key){
    const entry = (currentData.escalas[type]||[]).find(e=>e.data===dateStr);
    if (!entry) return "";
    return (entry.slots||{})[key];
  }
  function setEscalaSlot(type, dateStr, key, val){
    const entry = (currentData.escalas[type]||[]).find(e=>e.data===dateStr);
    if (!entry) return;
    entry.slots = entry.slots || {};
    entry.slots[key] = val;
  }

  // ---------------------------
  // Membros (com funções + minhas escalas automáticas)
  // ---------------------------
  function computeMyEscalas(memberId){
    const out = [];

    // banda/midia/som
    const addFromType = (type, labelMap = {}) => {
      (currentData.escalas[type]||[]).forEach(e=>{
        const slots = e.slots || {};
        Object.keys(slots).forEach(k=>{
          const v = slots[k];
          if (Array.isArray(v) && v.includes(memberId)) {
            const label = labelMap[k] || (k==="Vocais" ? "Vocal" : k);
            out.push({ data:e.data, txt:`${e.data} - ${label}` });
          } else if (typeof v === "string" && v === memberId) {
            const label = labelMap[k] || k;
            out.push({ data:e.data, txt:`${e.data} - ${label}` });
          }
        });
      });
    };

    addFromType("banda");
    addFromType("midia");
    addFromType("som");

    // dança por equipe
    (currentData.escalas.danca||[]).forEach(e=>{
      const equipe = norm(e.slots?.Equipe || "");
      if (!equipe) return;
      const m = memberById(memberId);
      if (!m) return;

      if ((equipe === "Equipe A" || equipe === "Equipe B") && memberHasFunc(m, equipe)) {
        out.push({ data:e.data, txt:`${e.data} - Dança (${equipe})` });
      }
    });

    out.sort((a,b)=>sortByDate(a,b));
    // remove duplicados
    const seen = new Set();
    return out.filter(x=>{
      if (seen.has(x.txt)) return false;
      seen.add(x.txt);
      return true;
    }).map(x=>x.txt);
  }

  function renderMembros(){
    const container = byId("members-container");
    container.innerHTML = "";

    currentData.membros.forEach((m, idx) => {
      const funcs = (m.funcoes||[]);
      const chips = funcs.length
        ? funcs.map(f=>`<span class="chip muted">${funcIcon(f)} ${f}</span>`).join("")
        : `<span class="chip muted">— sem funções</span>`;

      const minhas = computeMyEscalas(m.id);
      const minhasHtml = minhas.length ? minhas.join("<br>") : `<span style="color:var(--text-muted)">Nenhuma escala encontrada.</span>`;

      container.innerHTML += `
        <div class="m-card">
          <img src="${m.img}" style="width:140px; height:140px;" class="m-avatar"
               onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(m.nome)}&background=2dd4bf&color=020617'">
          <div style="font-size: 1.8rem;" class="m-name">${m.nome}</div>
          <div style="font-size: 1rem; margin-bottom: 14px;" class="m-bday">🎂 Aniversário: ${m.aniv}</div>

          <div class="chip-row" style="margin: 10px 0 20px 0;">
            <button class="small-btn ${isAdmin?'primary':''}" data-func-btn="${m.id}">Funções</button>
          </div>
          <div class="chip-row" id="funcs-${m.id}">
            ${chips}
          </div>

          <button class="btn-escala" style="max-width: 280px; margin-top: 22px;" onclick="toggleEscala(${idx})">VER MINHA ESCALA</button>
          <div class="escala-list" id="esc-${idx}">
            <strong style="color:var(--accent); display:block; margin-bottom:10px;">Suas Escalas:</strong>
            ${minhasHtml}
          </div>
        </div>
      `;
    });

    // Botão Funções
    container.querySelectorAll("[data-func-btn]").forEach(btn=>{
      btn.onclick = () => {
        const id = btn.getAttribute("data-func-btn");
        if (!isAdmin) {
          // não-admin: só alterna mostrar/ocultar
          const box = byId(`funcs-${id}`);
          if (box) box.style.display = (box.style.display==="none") ? "flex" : "none";
          return;
        }
        openMemberFunctionsEditor(id);
      };
    });
  }

  // Mantém compatibilidade com seu toggleEscala original
  window.toggleEscala = function(id) {
    const el = document.getElementById(`esc-${id}`);
    if (!el) return;
    el.style.display = (el.style.display === 'block') ? 'none' : 'block';
  };

  function openMemberFunctionsEditor(memberId){
    const m = memberById(memberId);
    if (!m) return;

    const current = new Set(m.funcoes || []);
    const items = FUNCOES.map(f=>{
      const on = current.has(f.key);
      return `
        <div class="list-item" data-fkey="${f.key}">
          <div class="left">
            <div class="top">${f.icon} ${f.key}</div>
            <div class="sub">${on ? "Selecionado" : "Toque para selecionar"}</div>
          </div>
          <div>${on ? "✅" : ""}</div>
        </div>
      `;
    }).join("");

    openModal(`
      <div class="modal-card">
        <div class="modal-title">Funções — ${m.nome} <button class="modal-close" onclick="__closeModal()"><i class="fas fa-times"></i></button></div>
        <div class="edit-hint">Toque para marcar/desmarcar (você pode escolher várias).</div>
        ${items}
        <hr class="sep">
        <button class="small-btn primary" id="btn-save">Salvar</button>
      </div>
    `);

    document.querySelectorAll(".list-item[data-fkey]").forEach(li=>{
      li.onclick = () => {
        const fkey = li.getAttribute("data-fkey");
        if (current.has(fkey)) current.delete(fkey); else current.add(fkey);
        // reabrir para atualizar checks (simples e confiável)
        m.funcoes = Array.from(current);
        saveData();
        closeModal();
        openMemberFunctionsEditor(memberId);
        renderMembros();
        // também atualiza minhas escalas se necessário
      };
    });

    byId("btn-save").onclick = () => {
      m.funcoes = Array.from(current);
      saveData(); closeModal();
      renderMembros();
      // Ao mudar funções, os pickers de escala ficam corretos
    };
  }

  // ---------------------------
  // Ensaios
  // ---------------------------
  function renderEnsaios(){
    const ensCont = byId("ensaios-container");
    ensCont.innerHTML = "";

    (currentData.ensaios||[]).sort(sortByDate).forEach((e, idx) => {
      const mus = (e.musicas||[]).map((m, j) => {
        const cifraUrl = m.cifraId ? driveOpen(m.cifraId) : driveOpen(m.cifraUrl||"#");
        const audioUrl = m.audioId ? driveOpen(m.audioId) : driveOpen(m.audioUrl||"#");

        const cifraOk = cifraUrl && cifraUrl !== "#";
        const audioOk = audioUrl && audioUrl !== "#";

        return `
          <div class="repertorio-item">
            <b>${m.titulo}</b>
            <div class="link-box">
              ${cifraOk
                ? `<a href="${cifraUrl}" target="_blank" rel="noopener noreferrer" class="link-btn btn-cifra">CIFRA</a>`
                : `<span class="link-btn btn-cifra" style="opacity:.45; pointer-events:none;">SEM CIFRA</span>`
              }
              ${audioOk
                ? `<a href="${audioUrl}" target="_blank" rel="noopener noreferrer" class="link-btn btn-audio">ÁUDIO</a>`
                : `<span class="link-btn btn-audio" style="opacity:.45; pointer-events:none;">SEM ÁUDIO</span>`
              }
            </div>
          </div>
        `;
      }).join("");

      const adminBtns = isAdmin ? `
        <div style="display:flex; gap:10px; margin-top:10px;" class="admin-only">
          <button class="small-btn" data-edit-ensaio="${idx}">Editar</button>
          <button class="small-btn danger" data-del-ensaio="${idx}">Excluir</button>
        </div>
      ` : "";

      ensCont.innerHTML += `
        <div class="card">
          <b>📅 ${e.data} às ${e.hora}</b><br><br>
          ${mus}
          ${adminBtns}
        </div>
      `;
    });

    // rodapé
    ensCont.innerHTML += `
      <div style="margin-top: 30px; padding: 20px; text-align: center; border-top: 1px solid var(--border);">
        <p style="color: var(--accent); font-weight: 800; font-size: 0.9rem; margin-bottom: 10px; white-space: pre-line;">
          ${escapeHtml(currentData.titulos.ensaiosRodape1 || "")}
        </p>
        <p style="color: #ef4444; font-weight: 800; font-size: 0.9rem; background: rgba(239, 68, 68, 0.1); padding: 10px; border-radius: 10px; white-space: pre-line;">
          ${escapeHtml(currentData.titulos.ensaiosRodape2 || "")}
        </p>
      </div>
    `;

    if (isAdmin) {
      ensCont.querySelectorAll("[data-edit-ensaio]").forEach(btn=>{
        btn.onclick = () => openEnsaioEditor(parseInt(btn.getAttribute("data-edit-ensaio"),10));
      });
      ensCont.querySelectorAll("[data-del-ensaio]").forEach(btn=>{
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute("data-del-ensaio"),10);
          if (confirm("Excluir este ensaio?")) {
            currentData.ensaios.splice(i,1);
            saveData();
            renderEnsaios();
          }
        };
      });
    }
  }

  function openEnsaioEditor(idx){
    const e = currentData.ensaios[idx];
    if (!e) return;

    const songs = (e.musicas||[]).map((m, j)=>`
      <div style="border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:10px;">
        <div class="grid-2">
          <div>
            <label class="escala-label">Nome da música</label>
            <input class="input" data-song-title="${j}" value="${escapeHtml(m.titulo||"")}" placeholder="Nome">
          </div>
          <div style="display:flex; gap:10px; align-items:flex-end; justify-content:flex-end;">
            <button class="small-btn danger" data-del-song="${j}">Excluir</button>
          </div>
        </div>
        <div class="grid-2" style="margin-top:10px;">
          <div>
            <label class="escala-label">Cifra (ID do Drive)</label>
            <input class="input" data-song-cifra="${j}" value="${escapeHtml(m.cifraId||"")}" placeholder="ex: 1otoLrB...">
          </div>
          <div>
            <label class="escala-label">Áudio (ID do Drive)</label>
            <input class="input" data-song-audio="${j}" value="${escapeHtml(m.audioId||"")}" placeholder="ex: 1iY-09...">
          </div>
        </div>
        <div class="edit-hint">Cole só o ID (a parte depois de /d/ ) para abrir mais rápido.</div>
      </div>
    `).join("");

    openModal(`
      <div class="modal-card">
        <div class="modal-title">Editar Ensaio — ${e.data} <button class="modal-close" onclick="__closeModal()"><i class="fas fa-times"></i></button></div>

        <div class="grid-2">
          <div>
            <label class="escala-label">Data (DD/MM)</label>
            <input id="ensaio-data" class="input" value="${escapeHtml(e.data)}">
          </div>
          <div>
            <label class="escala-label">Hora</label>
            <input id="ensaio-hora" class="input" value="${escapeHtml(e.hora)}">
          </div>
        </div>

        <hr class="sep">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div class="escala-label">Músicas</div>
          <button class="small-btn" id="btn-add-song">+ Música</button>
        </div>
        <div style="margin-top:10px;" id="songs-wrap">
          ${songs || `<div class="edit-hint">Nenhuma música ainda. Clique em “+ Música”.</div>`}
        </div>

        <hr class="sep">
        <div style="display:flex; gap:10px;">
          <button class="small-btn primary" id="btn-save">Salvar</button>
          <button class="small-btn" onclick="__closeModal()">Cancelar</button>
        </div>
      </div>
    `);

    // delete song
    document.querySelectorAll("[data-del-song]").forEach(btn=>{
      btn.onclick = () => {
        const j = parseInt(btn.getAttribute("data-del-song"),10);
        e.musicas.splice(j,1);
        saveData(); closeModal(); openEnsaioEditor(idx); renderEnsaios();
      };
    });

    byId("btn-add-song").onclick = () => {
      e.musicas = e.musicas || [];
      e.musicas.push({ titulo:"", cifraId:"", audioId:"" });
      saveData(); closeModal(); openEnsaioEditor(idx); renderEnsaios();
    };

    byId("btn-save").onclick = () => {
      const nd = norm(byId("ensaio-data").value);
      const nh = norm(byId("ensaio-hora").value);
      if (!/^\d{2}\/\d{2}$/.test(nd)) return toast("Data inválida. Use DD/MM.");
      e.data = nd; e.hora = nh;

      // songs fields
      (e.musicas||[]).forEach((m, j)=>{
        const t = document.querySelector(`[data-song-title="${j}"]`);
        const c = document.querySelector(`[data-song-cifra="${j}"]`);
        const a = document.querySelector(`[data-song-audio="${j}"]`);
        m.titulo = norm(t?.value);
        m.cifraId = norm(c?.value);
        m.audioId = norm(a?.value);
      });

      saveData(); closeModal(); renderEnsaios();
    };
  }

  // ---------------------------
  // Discipulado
  // ---------------------------
  function renderDiscipulado(){
    byId("discipulado-passagem").textContent = currentData.discipulado?.texto || "";
    const cont = byId("grupos-container");
    cont.innerHTML = "";
    (currentData.grupos||[]).forEach(g=>{
      cont.innerHTML += `<div class="card"><b>${g.g}</b> ${g.l}<br><small>${g.m}</small></div>`;
    });
  }

  // ---------------------------
  // Uniformes
  // ---------------------------
  function renderUniformes(){
    const cont = byId("uniformes-grid");
    cont.innerHTML = "";

    (currentData.uniformes||[]).sort(sortByDate).forEach((u, idx)=>{
      cont.innerHTML += `
        <div onclick="viewImg('${u.imagem}')" style="background: var(--glass); padding: 15px; border-radius: 12px; text-align: center; border: 1px solid var(--border); cursor:pointer;">
          <i class="fas fa-calendar-day" style="color: var(--accent); margin-bottom: 8px;"></i>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${u.data}</div>
          <div style="font-size: 0.9rem; font-weight: 700;">${u.titulo}</div>
          ${isAdmin ? `<div style="margin-top:10px; display:flex; justify-content:center; gap:10px;">
            <button class="small-btn" onclick="event.stopPropagation(); openUniformeEditor(${idx})">Editar</button>
            <button class="small-btn danger" onclick="event.stopPropagation(); delUniforme(${idx})">Excluir</button>
          </div>` : ""}
        </div>
      `;
    });
  }

  window.openUniformeEditor = function(idx){
    if (!isAdmin) return;
    const u = currentData.uniformes[idx];
    if (!u) return;

    // lista imagens png disponíveis
    const imgs = window.__ASSET_IMAGES || [];
    const options = imgs.map(fn=>`<option value="${fn}" ${fn===u.imagem?"selected":""}>${fn}</option>`).join("");

    openModal(`
      <div class="modal-card">
        <div class="modal-title">Editar Uniforme <button class="modal-close" onclick="__closeModal()"><i class="fas fa-times"></i></button></div>
        <div class="grid-2">
          <div>
            <label class="escala-label">Data (DD/MM)</label>
            <input id="u-data" class="input" value="${escapeHtml(u.data)}">
          </div>
          <div>
            <label class="escala-label">Título</label>
            <input id="u-titulo" class="input" value="${escapeHtml(u.titulo)}">
          </div>
        </div>
        <div style="margin-top:10px;">
          <label class="escala-label">Imagem (arquivo na pasta)</label>
          <select id="u-img" class="select-met">
            ${options}
          </select>
        </div>
        <div style="margin-top:12px; display:flex; gap:10px;">
          <button class="small-btn primary" id="btn-save">Salvar</button>
          <button class="small-btn" onclick="__closeModal()">Cancelar</button>
        </div>
      </div>
    `);

    byId("btn-save").onclick = ()=>{
      const d = norm(byId("u-data").value);
      if (!/^\d{2}\/\d{2}$/.test(d)) return toast("Data inválida. Use DD/MM.");
      u.data = d;
      u.titulo = norm(byId("u-titulo").value);
      u.imagem = norm(byId("u-img").value);
      saveData(); closeModal(); renderUniformes(); renderHeader();
    };
  };

  window.delUniforme = function(idx){
    if (!isAdmin) return;
    if (!confirm("Excluir este uniforme?")) return;
    currentData.uniformes.splice(idx,1);
    saveData(); renderUniformes();
  };

  // ---------------------------
  // Info
  // ---------------------------
  function infoTemplate(kind){
    const i = currentData.info?.[kind] || {};
    const resp = i.responsavel || "";
    if (kind === "louvor") {
      return `
        <h3>🗓️ Ensaios e Reuniões</h3>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin: -12px 0 15px 5px;">Responsável ${resp}</div>
        <p><b>🔹 🙏 CONVOCAÇÃO PARA TODOS OS MINISTROS:</b><br>
        Toda quarta e quinta consagração pessoal com jejum, oração e meditação na palavra.</p>
        <ul>
          <li><b>🕢 Horário de chegada:</b> 19:15</li>
          <li style="list-style: none; margin-left: -20px; color: var(--warning); font-size: 0.8rem;">
            <i>⚠️ Obs: Todos os membros do ministério de Louvor devem estar presentes nos ensaios (Banda, Dança, Mídia e Som)</i>
          </li>
          <li><b>🙏 Oração e recados:</b> 19:30 – 19:50</li>
          <li><b>🎶 Início da primeira música:</b> 19:50</li>
        </ul>
        <h3>⛪ Instruções para os Cultos de Quinta-feira</h3>
        <ul>
          <li><b>🕢 Chegada:</b> 19:05 (montagem)</li>
          <li><b>🎚️ Passagem de som:</b> até 19:20</li>
          <li><b>🙏 Oração:</b> 19:20</li>
          <li><b>🎵 Início do culto:</b> 19:30</li>
        </ul>
        <h3>⭐ Importante:</h3>
        <ul>
          <li>Ensaios gerais obrigatórios para toda a banda e vocalistas.</li>
          <li>Se não puder comparecer na data escalada, comunicar com antecedência.</li>
        </ul>
        <h3>🎤 Orientação durante a ministração</h3>
        <p><b>📌 A banda retorna após a pregação:</b></p>
        <div style="background: var(--glass); padding: 12px; border-radius: 10px; border-left: 4px solid var(--accent); font-size: 0.85rem; line-height: 1.5;">
          Quando o pastor pedir para as pessoas fecharem os olhos e abaixarem a cabeça, a banda pode retornar ao altar e a música deve ser tocada na parte mais alta (coro ou pré-refrão), ministrando com firmeza e autoridade, tanto na voz quanto nos instrumentos.
        </div>
        <p style="margin-top: 15px; font-size: 0.85rem;"><b>📌 Nota:</b><br>
          Em caso de alteração de músicas, quem encontrar a cifra primeiro deve postá-la no grupo.</p>

        <h3>📂 Google Drive</h3>
        <p>
          <a href="${escapeHtml(i.driveCifras||"#")}" target="_blank" style="color:var(--accent); text-decoration: none; font-weight: 700;">
            📄 Pasta de Cifras
          </a>
        </p>
        <p>
          <a href="${escapeHtml(i.driveAudios||"#")}" target="_blank" style="color:var(--accent); text-decoration: none; font-weight: 700;">
            🎧 Pasta de Áudios
          </a>
        </p>
      `;
    }

    if (kind === "danca") {
      return `
        <h3>💃 Dança</h3>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin: -12px 0 15px 5px;">Responsável ${resp}</div>
        <p><b>🔹 Divisão em equipes (A, B, C):</b><br>
        Ajuda a manter o revezamento equilibrado.</p>
        <p><b>🔹 Ensaio semanal:</b><br>
        Definir dia fixo (exemplo: sábado às 15h).</p>
        <p><b>🔹 Compromisso:</b><br>
        Chegar com 30 minutos de antecedência nos cultos.</p>
        <p><b>🔹 Trocas:</b><br>
        Somente mediante aviso prévio à liderança.</p>
        <p><b>🔹 🙏 CONVOCAÇÃO PARA TODOS OS MINISTROS:</b><br>
        Toda quarta e quinta consagração pessoal com jejum, oração e meditação na palavra.</p>
        <div style="background: var(--glass); padding: 12px; border-radius: 10px; border-left: 4px solid var(--accent); margin-top: 15px;">
          <p style="margin: 0; font-size: 0.85rem;"><b>📌 Obs:</b><br>
          É necessária a presença de todos nos ensaios e reuniões do Louvor.</p>
        </div>
      `;
    }

    if (kind === "midia") {
      return `
        <h3>📸 Mídia</h3>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin: -12px 0 15px 5px;">Responsável ${resp}</div>
        <ul>
          <li><b>🔁 Trocas:</b> Em caso de alteração de escalas, avisar com antecedência.</li>
          <li><b>⏰ Horário:</b> Chegar pelo menos 15 minutos antes do culto.</li>
        </ul>
        <p><b>🔹 🙏 CONVOCAÇÃO PARA TODOS OS MINISTROS:</b><br>
        Toda quarta e quinta consagração pessoal com jejum, oração e meditação na palavra.</p>
        <div style="background: var(--glass); padding: 15px; border-radius: 12px; text-align: center; margin: 20px 0; border: 1px dashed var(--accent);">
          <small>✨ Versículo para meditação:</small><br>
          <p style="font-style: italic; margin: 5px 0;">"Esforcem-se para conservar a unidade do Espírito pelo vínculo da paz."</p>
          <b>Efésios 4:3</b>
        </div>
        <div style="background: var(--glass); padding: 12px; border-radius: 10px; border-left: 4px solid var(--accent);">
          <p style="margin: 0; font-size: 0.85rem;"><b>📌 Obs:</b><br>
          É necessária a presença de todos nos ensaios e reuniões do Louvor.</p>
        </div>
      `;
    }

    // som
    return `
      <h3>🎚️ Som</h3>
      <div style="font-size: 0.8rem; color: var(--text-muted); margin: -12px 0 15px 5px;">Responsável ${resp}</div>
      <p><b>⏰ Chegada:</b> Pelo menos 20 minutos antes do início dos cultos.</p>

      <div style="background: var(--glass); padding: 12px; border-radius: 10px; border-left: 4px solid var(--accent); margin-bottom: 20px;">
        <p style="margin: 0; font-size: 0.85rem;"><b>📌 Obs:</b><br>
        É necessária a presença de todos nos ensaios e reuniões do Louvor.</p>
      </div>

      <p><b>🔹 🙏 CONVOCAÇÃO PARA TODOS OS MINISTROS:</b><br>
      Toda quarta e quinta consagração pessoal com jejum, oração e meditação na palavra.</p>

      <h3>🔊 Funções Técnicas</h3>
      <p><b>🎛️ P.A (Frente) — Mixagem para o público</b></p>
      <ul style="font-size: 0.85rem; color: var(--text-muted);">
        <li>Equalização geral (graves, médios e agudos)</li>
        <li>Volume e dinâmica de cada instrumento e voz</li>
        <li>Uso de efeitos (reverb, delay, compressão)</li>
        <li>Garantir som equilibrado e agradável no ambiente</li>
      </ul>

      <p><b>🎧 Monitor (Palco) — Retorno para músicos</b></p>
      <ul style="font-size: 0.85rem; color: var(--text-muted);">
        <li>Ajuste de volumes individuais para cada músico</li>
        <li>Evitar microfonia/feedback</li>
        <li>Ajustes rápidos durante o culto</li>
        <li>Conferência de in-ears, talkback, cabos e retornos</li>
      </ul>
    `;
  }

  function renderInfo(kind){
    const box = byId("info-container");
    const i = currentData.info?.[kind] || {};
    const html = norm(i.textoHtml) ? i.textoHtml : infoTemplate(kind);
    box.innerHTML = html;

    if (isAdmin) {
      box.insertAdjacentHTML("afterbegin", `
        <div class="admin-only" style="margin-bottom:12px;">
          <button class="small-btn" onclick="openInfoEditor('${kind}')">Editar texto desta aba</button>
        </div>
      `);
    }
  }

  window.openInfoEditor = function(kind){
    if (!isAdmin) return;
    const i = currentData.info?.[kind] || (currentData.info[kind] = {});
    const current = i.textoHtml || "";
    openModal(`
      <div class="modal-card">
        <div class="modal-title">Editar Info — ${kind.toUpperCase()} <button class="modal-close" onclick="__closeModal()"><i class="fas fa-times"></i></button></div>
        <div class="edit-hint">Você pode colar texto simples ou HTML. Se deixar vazio, o app usa o modelo padrão.</div>
        <textarea id="txt" class="textarea" placeholder="Cole aqui...">${escapeHtml(current)}</textarea>
        <div style="margin-top:12px; display:flex; gap:10px;">
          <button class="small-btn primary" id="btn-save">Salvar</button>
          <button class="small-btn danger" id="btn-clear">Usar padrão</button>
        </div>
      </div>
    `);
    byId("btn-save").onclick = ()=>{
      i.textoHtml = byId("txt").value;
      saveData(); closeModal();
      renderInfo(kind);
    };
    byId("btn-clear").onclick = ()=>{
      i.textoHtml = "";
      saveData(); closeModal();
      renderInfo(kind);
    };
  };

  // ---------------------------
  // Avisos (OneSignal + Aviso Raiz)
  // ---------------------------
  function injetarAvisoRaiz(){
    let historico = JSON.parse(localStorage.getItem(LS_AVISOS_KEY) || "[]");
    let apagados = JSON.parse(localStorage.getItem(LS_APAGADOS_KEY) || "[]");

    if (apagados.includes(AVISO_RAIZ.id)) return;

    const jaExiste = historico.find(a => a.id_raiz === AVISO_RAIZ.id);
    if (!jaExiste && norm(AVISO_RAIZ.texto)) {
      historico.unshift({
        id_raiz: AVISO_RAIZ.id,
        titulo: AVISO_RAIZ.titulo,
        texto: AVISO_RAIZ.texto,
        data: AVISO_RAIZ.data
      });
      localStorage.setItem(LS_AVISOS_KEY, JSON.stringify(historico.slice(0, 15)));

      const badge = byId("notif-badge");
      if (badge) badge.style.display = "inline";
    }
  }

  function renderizarAvisos(){
    const lista = byId("lista-notificacoes");
    if (!lista) return;

    const historico = JSON.parse(localStorage.getItem(LS_AVISOS_KEY) || "[]");
    if (historico.length === 0) {
      lista.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px; font-size: 0.85rem;">Nenhuma notificação recebida ainda.</p>`;
      return;
    }

    lista.innerHTML = historico.map(a => `
      <div class="repertorio-item" style="border-left-color: var(--warning); margin-bottom:12px; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px;">
        <div style="font-size:0.65rem; color:var(--accent); font-weight:800;">${escapeHtml(a.data||"")}</div>
        <div style="font-weight:700; color:white; margin:3px 0; font-size: 0.9rem;">${escapeHtml(a.titulo||"Aviso")}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(a.texto||"")}</div>
      </div>
    `).join("");
  }

  window.limparAvisos = function(){
    if(!confirm("Deseja apagar as mensagens antigas?")) return;

    let apagados = JSON.parse(localStorage.getItem(LS_APAGADOS_KEY) || "[]");
    if (!apagados.includes(AVISO_RAIZ.id)) {
      apagados.push(AVISO_RAIZ.id);
      localStorage.setItem(LS_APAGADOS_KEY, JSON.stringify(apagados));
    }
    localStorage.removeItem(LS_AVISOS_KEY);
    renderizarAvisos();
  };

  // OneSignal foreground listener (se existir)
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal) {
    try {
      OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
        const n = event.notification;
        const novoAviso = {
          titulo: n.title || "Aviso",
          texto: n.body || "",
          data: new Date().toLocaleString('pt-BR')
        };

        let historico = JSON.parse(localStorage.getItem(LS_AVISOS_KEY) || "[]");
        historico.unshift(novoAviso);
        localStorage.setItem(LS_AVISOS_KEY, JSON.stringify(historico.slice(0, 15)));

        const badge = byId("notif-badge");
        if (badge) badge.style.display = "inline";
        renderizarAvisos();
      });
    } catch(_) {}
  });

  // ---------------------------
  // Admin central (export/import + títulos)
  // ---------------------------
  function renderAdmin(){
    if (!isAdmin) return;
    const box = byId("admin-container");
    if (!box) return;

    const draftExists = !!localStorage.getItem(LS_DRAFT_KEY());
    const remoteStamp = remoteMeta?.updatedAt ? new Date(remoteMeta.updatedAt).toLocaleString("pt-BR") : "(ainda não publicado)";
    const remoteBy = remoteMeta?.updatedBy ? `por ${escapeHtml(remoteMeta.updatedBy)}` : "";

    box.innerHTML = `
      <div class="card">
        <div class="card-title"><i class="fas fa-sliders-h"></i> CONFIG & TÍTULOS</div>

        <div class="grid-2">
          <div>
            <label class="escala-label">Título (Topo)</label>
            <input id="cfg-title" class="input" value="${escapeHtml(APP_CONFIG.ministerio)}">
          </div>
          <div>
            <label class="escala-label">Subtítulo (Topo)</label>
            <input id="cfg-sub" class="input" value="${escapeHtml(APP_CONFIG.subtitulo)}">
          </div>
        </div>

        <div class="grid-2" style="margin-top:10px;">
          <div>
            <label class="escala-label">Mês (nome)</label>
            <input id="cfg-mes" class="input" value="${escapeHtml(APP_CONFIG.mesNome)}">
          </div>
          <div>
            <label class="escala-label">Ano</label>
            <input id="cfg-ano" class="input" value="${escapeHtml(APP_CONFIG.ano)}">
          </div>
        </div>

        <div style="margin-top:10px;">
          <label class="escala-label">Chave do mês (monthKey)</label>
          <input id="cfg-key" class="input" value="${escapeHtml(APP_CONFIG.monthKey)}">
          <div class="edit-hint">Dica: mude para 2026-02 e clique Salvar. Isso cria um “novo mês” no seu celular sem apagar Janeiro.</div>
        </div>

        <hr class="sep">

        <div class="grid-2">
          <div>
            <label class="escala-label">Ensaios — Título</label>
            <input id="t-ens-t" class="input" value="${escapeHtml(currentData.titulos.ensaiosTitulo||"")}">
          </div>
          <div>
            <label class="escala-label">Ensaios — Subtítulo</label>
            <input id="t-ens-s" class="input" value="${escapeHtml(currentData.titulos.ensaiosSubtitulo||"")}">
          </div>
        </div>

        <div class="grid-2" style="margin-top:10px;">
          <div>
            <label class="escala-label">Ensaios — Rodapé 1</label>
            <textarea id="t-ens-r1" class="textarea" style="min-height:90px;">${escapeHtml(currentData.titulos.ensaiosRodape1||"")}</textarea>
          </div>
          <div>
            <label class="escala-label">Ensaios — Rodapé 2</label>
            <textarea id="t-ens-r2" class="textarea" style="min-height:90px;">${escapeHtml(currentData.titulos.ensaiosRodape2||"")}</textarea>
          </div>
        </div>

        <div class="grid-2" style="margin-top:10px;">
          <div>
            <label class="escala-label">Uniformes — Título</label>
            <input id="t-uni" class="input" value="${escapeHtml(currentData.titulos.uniformesTitulo||"")}">
          </div>
          <div>
            <label class="escala-label">Discipulado — Título/Sub</label>
            <input id="t-dis-t" class="input" value="${escapeHtml(currentData.titulos.discipuladoTitulo||"")}">
            <input id="t-dis-s" class="input" style="margin-top:8px;" value="${escapeHtml(currentData.titulos.discipuladoSubtitulo||"")}">
          </div>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="small-btn primary" id="btn-save-titles">Salvar</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><i class="fas fa-cloud-upload-alt"></i> PUBLICAR PARA TODOS</div>
        <div class="edit-hint">
          ✅ Todos os músicos recebem o conteúdo <b>publicado</b> (remoto).<br>
          ✍️ Como admin, você pode editar como <b>rascunho local</b> e depois clicar em <b>Publicar agora</b>.
        </div>

        <div style="margin-top:10px;">
          <div class="edit-hint"><b>Última publicação:</b> ${remoteStamp} ${remoteBy}</div>
          <div class="edit-hint"><b>Rascunho local:</b> ${draftExists ? "✅ existe (apenas neste celular)" : "—"}</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
          <button class="small-btn primary" id="btn-publish">Publicar agora</button>
          <button class="small-btn" id="btn-pull">Puxar publicado</button>
          <button class="small-btn danger" id="btn-discard">Descartar rascunho</button>
        </div>

        <div class="edit-hint" style="margin-top:10px;">
          Dica: para trocar o mês, altere o <b>monthKey</b> (ex.: 2026-02), clique Salvar e depois publique.
        </div>
      </div>

      <div class="card">
        <div class="card-title"><i class="fas fa-bullhorn"></i> AVISO FIXO DO MÊS</div>

        <div class="grid-2">
          <div>
            <label class="escala-label">ID do aviso</label>
            <input id="a-id" class="input" value="${escapeHtml(AVISO_RAIZ.id)}" disabled>
            <div class="edit-hint">O ID é editado em <b>data-mes.js</b>. (Pra evitar duplicar aviso)</div>
          </div>
          <div>
            <label class="escala-label">Data</label>
            <input id="a-data" class="input" value="${escapeHtml(AVISO_RAIZ.data)}" disabled>
          </div>
        </div>

        <div style="margin-top:10px;">
          <label class="escala-label">Título</label>
          <input id="a-titulo" class="input" value="${escapeHtml(AVISO_RAIZ.titulo)}" disabled>
        </div>

        <div style="margin-top:10px;">
          <label class="escala-label">Texto</label>
          <textarea id="a-texto" class="textarea" disabled>${escapeHtml(AVISO_RAIZ.texto)}</textarea>
          <div class="edit-hint">Para editar o aviso fixo, altere <b>AVISO_RAIZ</b> em <b>data-mes.js</b> e publique.</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><i class="fas fa-database"></i> BACKUP / IMPORTAR / EXPORTAR</div>
        <div class="edit-hint">Exporta tudo em um JSON. Você pode salvar por mês e depois importar.</div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
          <button class="small-btn primary" id="btn-export">Baixar JSON</button>
          <label class="small-btn" style="cursor:pointer;">
            Importar JSON <input type="file" id="file-import" accept="application/json" style="display:none;">
          </label>
          <button class="small-btn danger" id="btn-reset">Resetar para padrão</button>
        </div>

        <div class="edit-hint" style="margin-top:10px;">
          ✅ Dica pro Netlify: você pode exportar e mandar esse JSON pra mim ou guardar como backup do mês.
        </div>
      </div>
    `;

    byId("btn-save-titles").onclick = () => {
      // salva títulos/labels
      APP_CONFIG.ministerio = norm(byId("cfg-title").value) || APP_CONFIG.ministerio;
      APP_CONFIG.subtitulo = norm(byId("cfg-sub").value) || APP_CONFIG.subtitulo;
      APP_CONFIG.mesNome = norm(byId("cfg-mes").value) || APP_CONFIG.mesNome;
      APP_CONFIG.ano = parseInt(byId("cfg-ano").value,10) || APP_CONFIG.ano;

      const newKey = norm(byId("cfg-key").value) || APP_CONFIG.monthKey;
      // se mudou monthKey, muda e recarrega dados (novo "banco")
      const changedKey = newKey !== APP_CONFIG.monthKey;
      APP_CONFIG.monthKey = newKey;

      currentData.titulos.ensaiosTitulo = norm(byId("t-ens-t").value);
      currentData.titulos.ensaiosSubtitulo = norm(byId("t-ens-s").value);
      currentData.titulos.ensaiosRodape1 = byId("t-ens-r1").value;
      currentData.titulos.ensaiosRodape2 = byId("t-ens-r2").value;
      currentData.titulos.uniformesTitulo = norm(byId("t-uni").value);
      currentData.titulos.discipuladoTitulo = norm(byId("t-dis-t").value);
      currentData.titulos.discipuladoSubtitulo = norm(byId("t-dis-s").value);

      saveData();

      if (changedKey) {
        // Ao trocar o mês, descarta rascunho do novo mês e recarrega do publicado
        clearDraft();
        loadData().then(renderAll);
        toast("Mês trocado ✅ Agora edite e publique.");
        return;
      }

      renderHeader(); renderEnsaios(); renderDiscipulado(); renderUniformes();
      toast("Salvo ✅");
    };

    // Publicar / puxar / descartar
    byId("btn-publish").onclick = () => {
      if (!confirm("Publicar agora para TODOS?")) return;
      publishRemote();
    };
    byId("btn-pull").onclick = async () => {
      if (!confirm("Puxar o conteúdo publicado e descartar seu rascunho local?")) return;
      clearDraft();
      await loadData();
      await renderAll();
      toast("Atualizado ✅");
    };
    byId("btn-discard").onclick = async () => {
      if (!confirm("Descartar rascunho local deste mês?")) return;
      clearDraft();
      await loadData();
      await renderAll();
      toast("Rascunho descartado ✅");
    };

    // Export
    byId("btn-export").onclick = () => {
      const blob = new Blob([JSON.stringify(currentData, null, 2)], { type:"application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `louvorpro-${APP_CONFIG.monthKey}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    // Import
    byId("file-import").addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          if (!obj || typeof obj !== "object") throw new Error("json");
          currentData = obj;
          saveData();
          renderAll();
          toast("Importado ✅");
        } catch(e) {
          toast("JSON inválido.");
        }
      };
      reader.readAsText(file);
    });

    // Reset
    byId("btn-reset").onclick = () => {
      if (!confirm("Resetar dados do mês atual para o padrão?")) return;
      clearDraft();
      currentData = deepClone(DEFAULT_DATA);
      saveData();
      renderAll();
      toast("Resetado ✅");
    };
  }

  // ---------------------------
  // Helpers: escape
  // ---------------------------
  function escapeHtml(s){
    return (s ?? "").toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  window.escapeHtml = escapeHtml;

  // ---------------------------
  // View Image (uniformes)
  // ---------------------------
  window.viewImg = function(s){
    byId('modal-img').src = s;
    byId('img-modal').style.display = 'flex';
  };

  // ---------------------------
  // Buscar cifra
  // ---------------------------
  window.buscarCifra = function(){
    const input = byId('search-input');
    const query = norm(input?.value);
    if (query) {
      const url = `https://www.google.com/search?q=site:cifraclub.com.br+${encodeURIComponent(query)}`;
      window.open(url, '_blank');
    } else {
      input?.focus();
    }
  };

  // ---------------------------
  // Render geral
  // ---------------------------
  async function renderAll(){
    renderHeader();
    initTabs();
    initBadges();

    renderEscalas("banda");
    renderEnsaios();
    renderMembros();
    renderDiscipulado();
    renderUniformes();
    renderInfo("louvor");
    renderizarAvisos();
    renderAdmin();

    // Ativos iniciais
    document.querySelectorAll('#escalas-subs .badge').forEach(x => x.classList.remove('active'));
    const b = document.querySelector('#escalas-subs .badge[data-type="banda"]');
    if (b) b.classList.add('active');

    document.querySelectorAll('#info-subs .badge').forEach(x => x.classList.remove('active'));
    const i = document.querySelector('#info-subs .badge[data-info="louvor"]');
    if (i) i.classList.add('active');
  }

  // ---------------------------
  // Coletar assets (para selects)
  // ---------------------------
  function collectAssets(){
    // Como não temos acesso direto ao filesystem no navegador,
    // listamos o que já existe na página (fallback) e mais uma lista padrão.
    // Para ajudar no editor de uniformes, mantemos uma lista fixa de imagens conhecidas:
    window.__ASSET_IMAGES = [
      "marrom-preto.png","verde-bege.png","azul-jeans.png","vinho-preto.png",
      "preto-bege.png"
    ];
  }

  // ---------------------------
  // INIT
  // ---------------------------
  window.addEventListener("load", async () => {
    initIdentity();
    collectAssets();
    await loadData();

    injetarAvisoRaiz();
    await renderAll();

    // Eventos inputs
    byId('search-input')?.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') window.buscarCifra();
    });

    // Escalas default
    renderEscalas("banda");
  });

})();
