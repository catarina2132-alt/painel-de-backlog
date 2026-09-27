/* =========================================================================
   PAINEL DE BACKLOG — app.js
   -------------------------------------------------------------------------
   Este arquivo concentra TODA a lógica de negócio do painel, migrada a
   partir da versão funcional de referência ("!DOCTYPE html claude.txt"),
   mantendo 100% das regras e comportamentos originais.

   A única mudança estrutural é a camada de persistência:
     - ORIGINAL: localStorage (chave por chave)
     - AQUI:     Firebase Authentication + Firestore
                 doc(db, "backlog_data", "main_state")

   Preferências puramente visuais e por navegador (qual sprint está
   selecionada na tela, em que ordem as colunas estão dispostas) continuam
   em localStorage, exatamente como na versão original — são preferências
   de quem está olhando o painel naquele navegador, não dados do backlog
   que precisem ser sincronizados entre usuários.
========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estrutura do Firestore preservada exatamente como já estava configurada.
const stateRef = doc(db, "backlog_data", "main_state");

/* =========================================================================
   TIPOS (Enabler, Split US, História, RITM, Debt...) — cores e cadastro
========================================================================= */

const DEFAULT_TIPOS = [
  { name: "ENABLER",  bg: "#f1f5f9", tx: "#475569" },
  { name: "SPLIT US", bg: "#f1f5f9", tx: "#475569" },
  { name: "HISTÓRIA", bg: "#e0f2fe", tx: "#0369a1" },
  { name: "RITM",     bg: "#fef9c3", tx: "#713f12" },
  { name: "DEBT",     bg: "#fee2e2", tx: "#991b1b" },
];
let tipos = [];

function tipoBelongsTo(tipoValue, registryName) {
  if (tipoValue === registryName) return true;
  if (registryName === "RITM" && tipoValue && /^RITM\d+/i.test(tipoValue)) return true;
  return false;
}

function styleForTipo(tipoName) {
  const exact = tipos.find(x => x.name === tipoName);
  if (exact) return { bg: exact.bg, tx: exact.tx };
  if (tipoName && /^RITM\d+/i.test(tipoName)) {
    const ritm = tipos.find(x => x.name === "RITM");
    if (ritm) return { bg: ritm.bg, tx: ritm.tx };
  }
  return { bg: "#f1f5f9", tx: "#475569" }; // fallback: "Outros/Novos tipos"
}

/* =========================================================================
   STATUS
========================================================================= */

const STATUS_OPTIONS = [
  "A fazer",
  "Pronto para Desenvolvimento",
  "Em desenvolvimento",
  "Pronto para Testes",
  "Em teste",
  "Pronto para Homologação",
  "Em homologação",
  "Em implantação",
  "Validação em Produção",
  "Concluído",
  "Não concluído",
  "Bloqueado",
  "Cancelado",
];
const STATUS_STYLES = {
  "A fazer":                    { bg: "#f1f5f9", tx: "#475569" },
  "Pronto para Desenvolvimento": { bg: "#e0f2fe", tx: "#0369a1" },
  "Em desenvolvimento":          { bg: "#dbeafe", tx: "#1d4ed8" },
  "Pronto para Testes":          { bg: "#ffedd5", tx: "#c2410c" },
  "Em teste":                    { bg: "#fef3c7", tx: "#b45309" },
  "Pronto para Homologação":     { bg: "#f3e8ff", tx: "#6b21a8" },
  "Em homologação":              { bg: "#fae8ff", tx: "#86198f" },
  "Em implantação":              { bg: "#e3faf2", tx: "#0b724b" },
  "Validação em Produção":       { bg: "#ccfbf1", tx: "#0f766e" },
  "Concluído":                   { bg: "#dcfce7", tx: "#15803d" },
  "Não concluído":               { bg: "#fff7ed", tx: "#9a3412" },
  "Bloqueado":                   { bg: "#fee2e2", tx: "#b91c1c" },
  "Cancelado":                   { bg: "#e2e8f0", tx: "#64748b" },
};
function styleForStatus(status) {
  return STATUS_STYLES[status] || { bg: "var(--card2)", tx: "var(--gray-dark)" };
}

/* =========================================================================
   DADOS PADRÃO (usados apenas quando o Firestore ainda não tem documento)
========================================================================= */

const DEFAULT_DATA = [
  { id: "STRY0026619", tipo: "ENABLER", item: "Adaptar Configurador para indicar fluxo relacionado", titulo: "Configurar fluxo de automatização por serviço", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027114", tipo: "ENABLER", item: "Designar solicitações para o robô", titulo: "Encaminhamento automático para grupo de robô", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027587", tipo: "ENABLER", item: "Implantação da Integração com o SEI", titulo: "Go-live da Integração com o SEI", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0028365", tipo: "ENABLER", item: "Suporte para o time Índigo", titulo: "Suporte à integração CSM com aplicativo", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0026620", tipo: "ENABLER", item: "Provisionar identidade para o App Detran", titulo: "Provisionamento de Identidade no App Detran", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027769", tipo: "ENABLER", item: "Ativar retorno para o cidadão", titulo: "Habilitar Retorno do Cidadão na Manifestação", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027764", tipo: "ENABLER", item: "Enviar e-mail de retorno para solicitação", titulo: "Enviar E-mail de Solicitação de Informações", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027822", tipo: "ENABLER", item: "Permitir configuração de data de validade", titulo: "Configuração de validade flexível para documentos", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0022284", tipo: "ENABLER", item: "Informar data de validade para Documento", titulo: "Informar data de validade para Documento", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0022331", tipo: "ENABLER", item: "Validação dinâmica de documentos pelo Portal", titulo: "Validação dinâmica de documentos no Portal", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0026615", tipo: "ENABLER", item: "Automatizar Emissão de Certidão de Dados", titulo: "Automação da emissão de certidão de propriedade", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027905", tipo: "SPLIT US", item: "Painel de Acompanhamento - Integração", titulo: "Associação de Fluxo ao Painel de Acompanhamento", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0028019", tipo: "SPLIT US", item: "Criar Documentação Técnica do SEI", titulo: "Documentação Técnica do Fluxo de Automação", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0026621", tipo: "HISTÓRIA", item: "Identificar solicitações criadas pelo App", titulo: "Identificação automática do canal de origem", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027251", tipo: "HISTÓRIA", item: "Solicitar mais informações na manifestação", titulo: "Ativar fluxo de Aguardando Informações", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027940", tipo: "RITM0652", item: '[CSM] Campo "situação" incluir status', titulo: 'Inclusão do Status "Respondido" na Situação', sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0026825", tipo: "DEBT", item: '[DEBT] Exibir corretamente a situação', titulo: 'Padronização da exibição da situação "Respondido"', sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027942", tipo: "RITM0637", item: "[CSM] Reprocessamento Base SLA Protocolos", titulo: "Reprocessamento de SLA de Protocolos", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027939", tipo: "SPLIT US", item: "Performance - Ajuste de Query no Widget", titulo: "Otimização do Widget de Tabela de SRV", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027980", tipo: "RITM0712", item: "[CSM] Ajuste Exibição das Abas do caso SAC", titulo: "Ajuste de Exibição das Abas do Caso SAC", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0027766", tipo: "RITM0733", item: "[CSM] Ajuste na Regra de contestação", titulo: "Regra de Contestação de Manifestações", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0028478", tipo: "RITM0749", item: "[CSM] Loop de autenticação após Termo", titulo: "Correção de Loop de Autenticação no Portal", sprint: "", projeto: "", status: "", pend: "" },
  { id: "STRY0028476", tipo: "RITM0748", item: "[CSM] Reinclusão de E-mail no formulário", titulo: "Ajuste de Reinclusão de Campo E-mail", sprint: "", projeto: "", status: "", pend: "" },
];

let data = [];

const STATUS_LABEL_MIGRATION = {
  "Pronto para testes": "Pronto para Testes",
  "Pronto para homologação": "Pronto para Homologação",
  "Em Validação em Produção": "Validação em Produção",
};

// Reparo pontual: versões antigas do painel colapsavam o número específico
// do chamado RITM para o tipo genérico "RITM". Isso restaura o número
// original para estes IDs conhecidos, mas só se o tipo ainda for o genérico
// "RITM" intocado — se o Tipo já foi editado manualmente, a escolha do
// usuário é respeitada.
const RITM_ID_FIX = {
  "STRY0027940": "RITM0652",
  "STRY0027942": "RITM0637",
  "STRY0027980": "RITM0712",
  "STRY0027766": "RITM0733",
  "STRY0028478": "RITM0749",
  "STRY0028476": "RITM0748",
};

function migrate(list) {
  return (Array.isArray(list) ? list : []).map(row => {
    const r = { ...row };
    if (r.sprint === undefined) r.sprint = "";
    if (!Array.isArray(r.sprintHistory)) {
      if (Array.isArray(r.history)) {
        r.sprintHistory = r.history.map(h => (typeof h === "string" ? h : h.sprint)).filter(Boolean);
      } else {
        r.sprintHistory = [];
      }
    }
    delete r.history;
    if (r.projeto === undefined) r.projeto = "";
    if (r.ritmId === undefined) r.ritmId = "";
    if (r.status === undefined) r.status = "";
    if (STATUS_LABEL_MIGRATION[r.status]) r.status = STATUS_LABEL_MIGRATION[r.status];
    if (r.pend && r.pend.trim().toLowerCase() === "nenhuma") r.pend = "";
    if (r.item === undefined) r.item = "";
    if (r.titulo === undefined) r.titulo = "";
    if (r.tipo) r.tipo = r.tipo.toUpperCase();
    if (r.tipo === "RITM" && RITM_ID_FIX[r.id]) r.tipo = RITM_ID_FIX[r.id];
    return r;
  });
}

// Reparo pontual: versões antigas do painel criavam uma linha DUPLICADA
// (mesmo ID) ao carregar um item para a próxima sprint, em vez de mover o
// original. Isso funde eventuais duplicatas remanescentes (desse
// comportamento antigo) de volta em uma única linha por ID, combinando a
// trilha de sprints em sprintHistory. Requer que `sprints` já esteja
// carregado (para a ordenação cronológica).
function dedupeCarriedItems(list) {
  const groups = {};
  list.forEach(item => {
    const key = item.id || `__norow_${Math.random()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  const order = getSortedSprints().map(s => s.name);
  const rank = (name) => {
    const i = order.indexOf(name);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  let changed = false;
  const result = [];
  Object.values(groups).forEach(group => {
    if (group.length === 1) { result.push(group[0]); return; }
    changed = true;
    const ordered = [...group].sort((a, b) => rank(a.sprint) - rank(b.sprint));
    const latest = ordered[ordered.length - 1];
    const trail = [];
    ordered.forEach(g => {
      (g.sprintHistory || []).forEach(h => { if (h && !trail.includes(h)) trail.push(h); });
      if (g !== latest && g.sprint && !trail.includes(g.sprint)) trail.push(g.sprint);
    });
    const merged = { ...latest, sprintHistory: trail };
    delete merged.carryOverFrom;
    result.push(merged);
  });
  return { list: result, changed };
}

/* =========================================================================
   SPRINTS
========================================================================= */

let sprints = []; // [{name, start, end}]

function getSortedSprints() {
  return [...sprints].sort((a, b) => {
    if (a.start && b.start) return a.start.localeCompare(b.start);
    if (a.start && !b.start) return -1;
    if (!a.start && b.start) return 1;
    return 0;
  });
}
function getNextSprintName(currentSprintName) {
  const sorted = getSortedSprints();
  const idx = sorted.findIndex(s => s.name === currentSprintName);
  if (idx === -1 || idx === sorted.length - 1) return null;
  return sorted[idx + 1].name;
}
function getPreviousSprintName(currentSprintName) {
  const sorted = getSortedSprints();
  const idx = sorted.findIndex(s => s.name === currentSprintName);
  if (idx <= 0) return null;
  return sorted[idx - 1].name;
}

function applySprintMove(idx, newSprint) {
  const item = data[idx];
  const oldSprint = item.sprint;
  if (!Array.isArray(item.sprintHistory)) item.sprintHistory = [];

  if (oldSprint && oldSprint !== newSprint) {
    const revertIndex = item.sprintHistory.indexOf(newSprint);
    if (revertIndex > -1) {
      // Voltando para uma sprint pela qual já passou: é uma correção, não um
      // avanço novo, então apaga a trilha a partir desse ponto.
      item.sprintHistory = item.sprintHistory.slice(0, revertIndex);
    } else if (!item.sprintHistory.includes(oldSprint)) {
      item.sprintHistory.push(oldSprint);
    }
  }
  item.sprint = newSprint;
}

function formatDateBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/* =========================================================================
   PREFERÊNCIAS LOCAIS (por navegador): sprint selecionada e ordem das colunas
========================================================================= */

let selectedSprint = "";

const SELECTED_SPRINT_KEY = "backlog-selected-sprint-v1";
const COLUMN_ORDER_KEY = "backlog-column-order-v1";

function lsGetJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return undefined;
    return JSON.parse(raw);
  } catch (e) { return undefined; }
}
function lsSetJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.error("Erro ao gravar preferência local:", e); }
}

function loadSelectedSprint() {
  const v = lsGetJSON(SELECTED_SPRINT_KEY);
  selectedSprint = typeof v === "string" ? v : "";
}
function saveSelectedSprint() {
  lsSetJSON(SELECTED_SPRINT_KEY, selectedSprint);
}

const DEFAULT_COLUMN_ORDER = ["id", "titulo", "status", "sprint", "tipo", "projeto", "ritm", "item", "pend"];
let columnOrder = DEFAULT_COLUMN_ORDER.slice();

function loadColumnOrder() {
  const parsed = lsGetJSON(COLUMN_ORDER_KEY);
  if (Array.isArray(parsed)) {
    const known = parsed.filter(k => COLUMN_DEFS[k]);
    const missing = DEFAULT_COLUMN_ORDER.filter(k => !known.includes(k));
    columnOrder = [...known, ...missing];
    return;
  }
  columnOrder = DEFAULT_COLUMN_ORDER.slice();
}
function saveColumnOrder() {
  lsSetJSON(COLUMN_ORDER_KEY, columnOrder);
}

/* =========================================================================
   AUTENTICAÇÃO
========================================================================= */

let currentUser = null;

function canEdit() {
  return !!currentUser;
}
function requireAuth(message) {
  if (!canEdit()) {
    alert(message || "Entre com sua conta para editar.");
    return false;
  }
  return true;
}

function authErrorMessage(e) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-disabled": "Este usuário foi desativado.",
    "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente de novo.",
    "auth/missing-password": "Digite a senha.",
  };
  return map[e.code] || ("Falha na autenticação: " + e.message);
}

/* =========================================================================
   PERSISTÊNCIA (FIRESTORE)
========================================================================= */

let eventsAttached = false;
let applyingRemoteSnapshot = false;

function showSavePill(text = "Salvo ✓") {
  const pill = document.getElementById("savePill");
  if (!pill) return;
  pill.textContent = text;
  pill.classList.add("show");
  clearTimeout(showSavePill._t);
  showSavePill._t = setTimeout(() => { pill.classList.remove("show"); pill.textContent = "Salvo ✓"; }, 1500);
}

async function persistState(showPill = true) {
  if (!canEdit()) return; // sem sessão autenticada, não grava no Firestore
  try {
    await setDoc(
      stateRef,
      {
        items: data,
        sprints: sprints,
        tipos: tipos,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.email || currentUser.uid,
      },
      { merge: true }
    );
    if (showPill) showSavePill();
  } catch (e) {
    console.error("Erro ao salvar no Firestore:", e);
    alert("Não foi possível salvar no Firestore. Confira sua conexão e as regras do banco.\n\n" + e.message);
  }
}

// Equivalentes às antigas saveData()/saveSprints()/saveTipos() — no Firestore,
// como tudo vive no mesmo documento, cada uma delas grava o documento inteiro.
function saveData(showPill = true) { return persistState(showPill); }
function saveSprints() { return persistState(true); }
function saveTipos() { return persistState(true); }

let debounceTimer = null;
function debounceSave() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => saveData(), 500);
}

// Rede de segurança: se a aba for fechada/recarregada enquanto um salvamento
// "adiado" (debounce) ainda está pendente, tenta gravar imediatamente antes
// de sair, para minimizar a chance de perder a última edição digitada.
window.addEventListener("beforeunload", () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    if (canEdit()) {
      try {
        setDoc(stateRef, {
          items: data, sprints: sprints, tipos: tipos,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.email || currentUser.uid,
        }, { merge: true });
      } catch (e) { /* noop */ }
    }
  }
});

function buildDefaultState() {
  return {
    items: migrate(JSON.parse(JSON.stringify(DEFAULT_DATA))),
    sprints: [],
    tipos: JSON.parse(JSON.stringify(DEFAULT_TIPOS)),
  };
}

function handleSnapshot(snap) {
  applyingRemoteSnapshot = true;
  try {
    const raw = snap.exists() ? snap.data() : null;

    if (!raw) {
      const seed = buildDefaultState();
      data = seed.items;
      sprints = seed.sprints;
      tipos = seed.tipos;
      // Só grava a semente inicial se houver sessão autenticada; caso
      // contrário, o painel exibe os dados padrão localmente até alguém
      // autenticado salvar algo.
      if (canEdit()) persistState(false);
    } else {
      sprints = Array.isArray(raw.sprints) ? raw.sprints : [];
      data = migrate(Array.isArray(raw.items) ? raw.items : []);

      const dedup = dedupeCarriedItems(data);
      if (dedup.changed) {
        data = dedup.list;
        if (canEdit()) persistState(false);
      }

      tipos = (Array.isArray(raw.tipos) && raw.tipos.length)
        ? raw.tipos
        : JSON.parse(JSON.stringify(DEFAULT_TIPOS));
    }

    if (!eventsAttached) {
      loadSelectedSprint();
      loadColumnOrder();
      attachEvents();
      renderTableHeader();
      eventsAttached = true;
    }

    renderSprintSelect();
    renderSprintList();
    renderTipoFilterOptions();
    renderTipoList();
    renderAll();
  } finally {
    applyingRemoteSnapshot = false;
  }
}

/* =========================================================================
   ÍCONES (indicadores)
========================================================================= */

const ICON_SVG = {
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18"/><path d="M5 4h11l-2 4 2 4H5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L2 19l3 3 7.3-7.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2z"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

/* =========================================================================
   HELPERS DE STRING / HTML
========================================================================= */

function escapeHtml(s) {
  return (s || "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function norm(v) { return (v || "").trim().toLowerCase(); }

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

/* =========================================================================
   OPÇÕES DE SELECT
========================================================================= */

function sprintOptionsHtml(current) {
  let names = sprints.map(s => s.name);
  if (current && !names.includes(current)) names = [current, ...names];
  const opts = [`<option value="" ${!current ? "selected" : ""}>—</option>`]
    .concat(names.map(n => `<option value="${escapeAttr(n)}" ${n === current ? "selected" : ""}>${escapeHtml(n)}</option>`));
  return opts.join("");
}

const PROJETO_OPTIONS = ["Melhoria", "Sustentação", "Demanda"];

function projetoOptionsHtml(current) {
  let names = PROJETO_OPTIONS.slice();
  if (current && !names.includes(current)) names = [current, ...names];
  const opts = [`<option value="" ${!current ? "selected" : ""}>—</option>`]
    .concat(names.map(n => `<option value="${escapeAttr(n)}" ${n === current ? "selected" : ""}>${escapeHtml(n)}</option>`));
  return opts.join("");
}

function tipoOptionsHtml(current) {
  let names = tipos.map(t => t.name);
  if (current && !names.includes(current)) names = [current, ...names];
  const opts = [`<option value="" ${!current ? "selected" : ""}>—</option>`]
    .concat(names.map(n => `<option value="${escapeAttr(n)}" ${n === current ? "selected" : ""}>${escapeHtml(n)}</option>`));
  return opts.join("");
}

/* =========================================================================
   FILTROS / BUSCA
========================================================================= */

function getSprintFilteredData() {
  if (!selectedSprint) return data;
  return data.filter(d => (d.sprint || "") === selectedSprint);
}

function currentFilters() {
  return {
    q: (document.getElementById("searchInput").value || "").trim().toLowerCase(),
    tipo: document.getElementById("filterTipo").value,
  };
}

let statFilter = null; // null | "melhorias" | "sustentacoes" | "demandas" | "pendencias"

function matchesFilter(row, filters) {
  if (selectedSprint && (row.sprint || "") !== selectedSprint) return false;
  if (filters.tipo && !tipoBelongsTo(row.tipo, filters.tipo)) return false;
  if (statFilter === "melhorias" && norm(row.projeto) !== "melhoria") return false;
  if (statFilter === "sustentacoes" && norm(row.projeto) !== "sustentação") return false;
  if (statFilter === "demandas" && norm(row.projeto) !== "demanda") return false;
  if (statFilter === "pendencias" && !(row.pend && row.pend.trim() !== "")) return false;
  if (filters.q) {
    const hay = (row.id + " " + row.item + " " + row.titulo + " " + (row.projeto || "") + " " + (row.sprint || "")).toLowerCase();
    if (!hay.includes(filters.q)) return false;
  }
  return true;
}

/* =========================================================================
   RESUMO DA SPRINT (linha 1 de indicadores)
========================================================================= */

function updateSprintSummary() {
  const box = document.getElementById("sprintSummary");
  const badge = document.getElementById("sprintDateBadge");
  const s = sprints.find(sp => sp.name === selectedSprint);
  const count = getSprintFilteredData().length;

  if (!s) {
    if (badge) badge.textContent = "Selecione uma sprint";
    box.innerHTML = `
      <div class="metric-card muted">
        <div class="metric-icon icon-blue">${ICON_SVG.layers}</div>
        <div class="metric-text">
          <div class="metric-label">Itens no backlog</div>
          <div class="metric-value">${count}</div>
          <div class="metric-sub">Nenhuma sprint selecionada</div>
        </div>
      </div>
    `;
    return;
  }

  const periodo = (s.start || s.end)
    ? `${formatDateBR(s.start) || "—"} – ${formatDateBR(s.end) || "—"}`
    : "—";
  if (badge) badge.textContent = periodo;

  const currentInS = getSprintFilteredData();
  const concluidos = currentInS.filter(d => d.status === "Concluído").length;
  const naoConcluidos = currentInS.length - concluidos;
  const carryOverItems = data.filter(d => Array.isArray(d.sprintHistory) && d.sprintHistory.includes(selectedSprint) && d.sprint !== selectedSprint);
  const vinculados = currentInS.length + carryOverItems.length;
  const pct = v => (vinculados > 0 ? Math.round((v / vinculados) * 100) : 0);
  const taxaEntrega = pct(concluidos);

  box.innerHTML = `
    <div class="metric-card">
      <div class="metric-icon icon-blue">${ICON_SVG.layers}</div>
      <div class="metric-text">
        <div class="metric-label">Itens vinculados</div>
        <div class="metric-value">${vinculados}</div>
        <div class="metric-sub">Total do backlog</div>
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-icon icon-green">${ICON_SVG.check}</div>
      <div class="metric-text">
        <div class="metric-label">Concluídos na sprint</div>
        <div class="metric-value">${concluidos}</div>
        <div class="metric-sub">${pct(concluidos)}% do total</div>
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-icon icon-amber">${ICON_SVG.clock}</div>
      <div class="metric-text">
        <div class="metric-label">Não concluídos na sprint</div>
        <div class="metric-value">${naoConcluidos}</div>
        <div class="metric-sub">${pct(naoConcluidos)}% do total</div>
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-icon icon-purple">${ICON_SVG.arrowRight}</div>
      <div class="metric-text">
        <div class="metric-label">Carregados para próxima sprint</div>
        <div class="metric-value">${carryOverItems.length}</div>
        <div class="metric-sub">${pct(carryOverItems.length)}% do total</div>
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-icon icon-blue">${ICON_SVG.flag}</div>
      <div class="metric-text">
        <div class="metric-label">Entrega da sprint</div>
        <div class="metric-value">${taxaEntrega}%</div>
        <div class="metric-bar-track"><div class="metric-bar-fill icon-blue-bar" style="width:${taxaEntrega}%;"></div></div>
      </div>
    </div>
  `;
}

/* =========================================================================
   SELECT DE SPRINT / LISTA DE SPRINTS (modal "Gerenciar Sprints")
========================================================================= */

function renderSprintSelect() {
  const sel = document.getElementById("sprintSelect");
  sel.innerHTML = `<option value="">Todos os itens</option>` +
    sprints.map(s => `<option value="${escapeAttr(s.name)}" ${s.name === selectedSprint ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
  sel.value = selectedSprint;
  updateSprintSummary();
}

function renderSprintList() {
  const list = document.getElementById("sprintList");
  if (sprints.length === 0) {
    list.innerHTML = `<div class="sprint-list-empty">Nenhuma sprint cadastrada ainda. Adicione uma acima.</div>`;
    return;
  }
  list.innerHTML = sprints.map((s, i) => `
    <div class="sprint-list-row">
      <div class="sp-name">${escapeHtml(s.name)}</div>
      <div class="sp-dates">${formatDateBR(s.start) || "—"} → ${formatDateBR(s.end) || "—"}</div>
      <button type="button" class="del-btn sprint-del-btn" data-sprint-idx="${i}" title="Excluir sprint">✕</button>
    </div>
  `).join("");
}

/* =========================================================================
   TIPOS: FILTRO E LISTA (modal "Gerenciar Tipos")
========================================================================= */

function renderTipoFilterOptions() {
  const sel = document.getElementById("filterTipo");
  const current = sel.value;
  sel.innerHTML = `<option value="">Todos os tipos</option>` +
    tipos.map(t => `<option value="${escapeAttr(t.name)}" ${t.name === current ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("");
  if (tipos.some(t => t.name === current)) sel.value = current;
}

function renderTipoList() {
  const list = document.getElementById("tipoList");
  if (tipos.length === 0) {
    list.innerHTML = `<div class="sprint-list-empty">Nenhum tipo cadastrado ainda.</div>`;
    return;
  }
  list.innerHTML = tipos.map((t, i) => {
    const usageCount = data.filter(d => tipoBelongsTo(d.tipo, t.name)).length;
    return `
    <div class="sprint-list-row">
      <span class="tipo-swatch" style="background:${t.bg}; color:${t.tx};">${escapeHtml(t.name)}</span>
      <div class="sp-dates">${usageCount} item(ns) usando este tipo</div>
      <button type="button" class="btn btn-ghost tipo-edit-btn" data-tipo-idx="${i}" style="padding:5px 10px; font-size:12px;">Editar</button>
      <button type="button" class="del-btn tipo-del-btn" data-tipo-idx="${i}" title="Excluir tipo">✕</button>
    </div>
  `;
  }).join("");
}

/* =========================================================================
   INDICADORES POR CATEGORIA (linha 2, clicáveis)
========================================================================= */

function computeStats() {
  const scoped = getSprintFilteredData();
  const total = scoped.length || 1;
  const melhorias = scoped.filter(d => norm(d.projeto) === "melhoria").length;
  const sustentacoes = scoped.filter(d => norm(d.projeto) === "sustentação").length;
  const demandas = scoped.filter(d => norm(d.projeto) === "demanda").length;
  const pendencias = scoped.filter(d => d.pend && d.pend.trim() !== "").length;
  return [
    { key: "melhorias", label: "Melhorias", value: melhorias, iconClass: "icon-blue", icon: ICON_SVG.star },
    { key: "sustentacoes", label: "Sustentações", value: sustentacoes, iconClass: "icon-green", icon: ICON_SVG.wrench },
    { key: "demandas", label: "Demandas", value: demandas, iconClass: "icon-purple", icon: ICON_SVG.clipboard },
    { key: "pendencias", label: "Pendências", value: pendencias, iconClass: "icon-amber", icon: ICON_SVG.warning },
  ].map(s => ({ ...s, total, pct: Math.round((s.value / total) * 100) }));
}

function renderStats() {
  const row = document.getElementById("statsRow");
  const stats = computeStats();
  row.innerHTML = stats.map(s => `
    <div class="stat-card${statFilter === s.key ? " active" : ""}" data-stat="${s.key}" role="button" tabindex="0"
      style="border-top-color:var(--${s.iconClass}-tx);" title="Clique para listar apenas ${s.label.toLowerCase()}">
      <div class="stat-icon ${s.iconClass}">${s.icon}</div>
      <div class="stat-body">
        <div class="label">${s.label}</div>
        <div class="value-row">
          <div class="value">${s.value} <span style="font-size:14px; font-weight:normal; color:var(--gray);">de ${s.total}</span></div>
        </div>
        <div class="bar-track"><div class="bar-fill ${s.iconClass}-bar" style="width:${s.pct}%;"></div></div>
        <div class="pct" style="margin-top:6px;">${s.pct}%</div>
      </div>
    </div>
  `).join("");
}

/* =========================================================================
   TABELA: DEFINIÇÃO DE COLUNAS
========================================================================= */

const COLUMN_DEFS = {
  id: {
    label: "ID", thStyle: "width:120px;",
    cell: (row, idx) => `<td class="id-col"><input value="${escapeAttr(row.id)}" data-field="id" data-idx="${idx}" ${canEdit() ? "" : "disabled"}></td>`
  },
  titulo: {
    label: "Título", thClass: "titulo-col",
    cell: (row, idx) => `<td class="titulo-col"><textarea class="titulo-input" rows="1" data-field="titulo" data-idx="${idx}" ${canEdit() ? "" : "disabled"}>${escapeHtml(row.titulo)}</textarea></td>`
  },
  status: {
    label: "Status", thStyle: "width:170px;",
    cell: (row, idx) => {
      const sst = styleForStatus(row.status);
      return `<td>
        <select class="status-select" data-field="status" data-idx="${idx}" style="background:${sst.bg}; color:${sst.tx};" ${canEdit() ? "" : "disabled"}>
          <option value="" ${!row.status ? "selected" : ""}>— Selecionar —</option>
          ${STATUS_OPTIONS.map(o => `<option value="${escapeAttr(o)}" ${row.status === o ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
        </select>
      </td>`;
    }
  },
  sprint: {
    label: "Sprint", thStyle: "width:140px;",
    cell: (row, idx) => `<td>
        <select class="sprint-select" data-field="sprint" data-idx="${idx}" ${canEdit() ? "" : "disabled"}>
          ${sprintOptionsHtml(row.sprint)}
        </select>
        ${(row.sprintHistory && row.sprintHistory.length) ? `
          <div class="carry-origin-tag" title="Trilha completa: ${escapeAttr([...row.sprintHistory, row.sprint].filter(Boolean).join(" → "))}">${escapeHtml([...row.sprintHistory, row.sprint].filter(Boolean).join(" → "))}</div>
          <button type="button" class="undo-carry-btn" data-idx="${idx}" title="Desfazer: volta este item para ${escapeAttr(row.sprintHistory[row.sprintHistory.length - 1])}">✕</button>
        ` : ""}
        ${row.sprint ? `<button type="button" class="carry-btn" data-idx="${idx}" title="Carregar para a próxima sprint">↷ Carregar</button>` : ""}
      </td>`
  },
  tipo: {
    label: "Tipo", thStyle: "width:110px;",
    cell: (row, idx) => {
      const st = styleForTipo(row.tipo);
      return `<td>
        <select class="tipo-select" data-field="tipo" data-idx="${idx}" style="background:${st.bg}; color:${st.tx};" ${canEdit() ? "" : "disabled"}>
          ${tipoOptionsHtml(row.tipo)}
        </select>
      </td>`;
    }
  },
  projeto: {
    label: "Projeto", thClass: "projeto-col", thStyle: "width:130px;",
    cell: (row, idx) => `<td class="projeto-col">
        <select class="projeto-select" data-field="projeto" data-idx="${idx}" ${canEdit() ? "" : "disabled"}>
          ${projetoOptionsHtml(row.projeto)}
        </select>
      </td>`
  },
  ritm: {
    label: "RITM", thStyle: "width:110px;",
    cell: (row, idx) => `<td>
        ${norm(row.projeto) === "sustentação"
        ? `<input class="ritm-id-input" value="${escapeAttr(row.ritmId || "")}" placeholder="RITM0000" data-field="ritmId" data-idx="${idx}" ${canEdit() ? "" : "disabled"}>`
        : `<span class="ritm-id-empty">—</span>`}
      </td>`
  },
  item: {
    label: "Descrição Técnica", thStyle: "width:220px;",
    cell: (row, idx) => `<td><input class="item-input" value="${escapeAttr(row.item)}" title="${escapeAttr(row.item)}" data-field="item" data-idx="${idx}" ${canEdit() ? "" : "disabled"}></td>`
  },
  pend: {
    label: "Pendência", thStyle: "width:130px;",
    cell: (row, idx) => {
      const pendEmpty = !row.pend || row.pend.trim() === "";
      return `<td>
        <textarea class="pend-input" rows="1" placeholder="Nenhuma" data-field="pend" data-idx="${idx}" ${canEdit() ? "" : "disabled"}
          style="background:${pendEmpty ? 'var(--ok-bg)' : 'var(--debt-bg)'}; color:${pendEmpty ? 'var(--ok-tx)' : 'var(--debt-tx)'};">${escapeHtml(row.pend || "")}</textarea>
      </td>`;
    }
  },
};

/* =========================================================================
   CABEÇALHO DA TABELA (com reordenação por arrastar)
========================================================================= */

function renderTableHeader() {
  const thead = document.getElementById("tableHead");
  const cols = columnOrder.map(key => {
    const def = COLUMN_DEFS[key];
    const styleAttr = def.thStyle ? ` style="${def.thStyle}"` : "";
    const classAttr = `col-draggable${def.thClass ? " " + def.thClass : ""}`;
    return `<th class="${classAttr}" data-col="${key}"${styleAttr} draggable="true"><span class="drag-handle">⠿</span>${escapeHtml(def.label)}</th>`;
  }).join("");
  thead.innerHTML = `<tr><th class="n-col">Nº</th>${cols}<th class="del-col"></th></tr>`;
  attachColumnDragEvents();
}

let dragSrcKey = null;
function attachColumnDragEvents() {
  const ths = document.querySelectorAll("#tableHead th.col-draggable");
  ths.forEach(th => {
    th.addEventListener("dragstart", () => {
      dragSrcKey = th.dataset.col;
      th.classList.add("col-dragging");
    });
    th.addEventListener("dragend", () => {
      th.classList.remove("col-dragging");
      document.querySelectorAll("#tableHead th.col-drag-over").forEach(x => x.classList.remove("col-drag-over"));
    });
    th.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (th.dataset.col !== dragSrcKey) th.classList.add("col-drag-over");
    });
    th.addEventListener("dragleave", () => { th.classList.remove("col-drag-over"); });
    th.addEventListener("drop", (e) => {
      e.preventDefault();
      th.classList.remove("col-drag-over");
      const targetKey = th.dataset.col;
      if (!dragSrcKey || dragSrcKey === targetKey) return;
      const from = columnOrder.indexOf(dragSrcKey);
      const to = columnOrder.indexOf(targetKey);
      if (from === -1 || to === -1) return;
      columnOrder.splice(from, 1);
      columnOrder.splice(to, 0, dragSrcKey);
      saveColumnOrder();
      renderTableHeader();
      renderTable();
    });
  });
}

/* =========================================================================
   CORPO DA TABELA
========================================================================= */

function renderTable() {
  const tbody = document.getElementById("tableBody");
  const filters = currentFilters();
  tbody.innerHTML = "";
  let shown = 0;

  // Quando o filtro ativo já restringe a exatamente um projeto (via clique
  // nos indicadores Melhorias/Sustentações/Demandas), a coluna Projeto vira
  // redundante.
  const singleProjectFilters = ["melhorias", "sustentacoes", "demandas"];
  document.querySelector("table").classList.toggle("hide-projeto", singleProjectFilters.includes(statFilter));

  data.forEach((row, idx) => {
    if (!matchesFilter(row, filters)) return;
    shown++;
    const tr = document.createElement("tr");
    const cellsHtml = columnOrder.map(key => COLUMN_DEFS[key].cell(row, idx)).join("");
    tr.innerHTML = `
      <td class="n-col">${idx + 1}</td>
      ${cellsHtml}
      <td class="del-col"><button type="button" class="del-btn" data-idx="${idx}" title="Excluir item" ${canEdit() ? "" : "disabled"}>✕</button></td>
    `;
    tbody.appendChild(tr);
    tr.querySelectorAll("textarea").forEach(autoResizeTextarea);
  });

  if (shown === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-row">Nenhum item encontrado. Ajuste os filtros ou adicione um novo item.</td></tr>`;
  }
}

function renderAll() {
  renderStats();
  renderTable();
  updateSprintSummary();
}

/* =========================================================================
   EVENTOS (ligados uma única vez, quando os elementos existem no DOM)
========================================================================= */

function attachEvents() {
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsMenu = document.getElementById("settingsMenu");
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle("open");
  });
  settingsMenu.addEventListener("click", (e) => {
    if (e.target.closest("button")) {
      settingsMenu.classList.remove("open");
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".settings-dropdown")) {
      settingsMenu.classList.remove("open");
    }
  });

  document.getElementById("resetColumnsBtn").addEventListener("click", () => {
    columnOrder = DEFAULT_COLUMN_ORDER.slice();
    saveColumnOrder();
    renderTableHeader();
    renderTable();
  });

  document.getElementById("statsRow").addEventListener("click", (e) => {
    const card = e.target.closest(".stat-card");
    if (!card) return;
    const key = card.dataset.stat;
    statFilter = (statFilter === key) ? null : key;
    renderStats();
    renderTable();
  });

  document.getElementById("tableBody").addEventListener("input", (e) => {
    const t = e.target;
    if (!(t.dataset && t.dataset.field !== undefined)) return;
    if (!canEdit()) return;
    const idx = parseInt(t.dataset.idx, 10);
    const field = t.dataset.field;
    data[idx][field] = t.value;
    debounceSave();

    if (t.tagName === "TEXTAREA") {
      autoResizeTextarea(t);
    }

    if (field === "pend") {
      const empty = !t.value || t.value.trim() === "";
      t.style.background = empty ? "var(--ok-bg)" : "var(--debt-bg)";
      t.style.color = empty ? "var(--ok-tx)" : "var(--debt-tx)";
      renderStats();
    }
    // id / item / titulo / pend: valor já salvo acima, sem necessidade de
    // re-renderizar a tabela inteira — assim o campo nunca perde o foco
    // enquanto o usuário digita.
  });

  document.getElementById("tableBody").addEventListener("change", (e) => {
    const t = e.target;
    if (!canEdit()) return;
    if (t.classList && t.classList.contains("status-select")) {
      const idx = parseInt(t.dataset.idx, 10);
      data[idx].status = t.value;
      const sst = styleForStatus(t.value);
      t.style.background = sst.bg;
      t.style.color = sst.tx;
      saveData();
      updateSprintSummary();
    } else if (t.classList && t.classList.contains("sprint-select")) {
      const idx = parseInt(t.dataset.idx, 10);
      applySprintMove(idx, t.value);
      saveData();
      renderTable();
      updateSprintSummary();
    } else if (t.classList && t.classList.contains("tipo-select")) {
      const idx = parseInt(t.dataset.idx, 10);
      data[idx].tipo = t.value;
      saveData();
      renderAll();
    } else if (t.classList && t.classList.contains("projeto-select")) {
      const idx = parseInt(t.dataset.idx, 10);
      data[idx].projeto = t.value;
      saveData();
      renderStats();
      renderTable();
    }
  });

  document.getElementById("tableBody").addEventListener("click", (e) => {
    const carryBtn = e.target.closest(".carry-btn");
    if (carryBtn) {
      if (!requireAuth()) return;
      if (carryBtn.dataset.busy === "1") return;
      const idx = parseInt(carryBtn.dataset.idx, 10);
      const original = data[idx];
      const nextSprint = getNextSprintName(original.sprint);
      if (!nextSprint) {
        carryBtn.textContent = "Sem próxima sprint";
        setTimeout(() => { carryBtn.textContent = "↷ Carregar"; }, 2000);
        return;
      }
      carryBtn.dataset.busy = "1";
      applySprintMove(idx, nextSprint);
      data[idx].status = "A fazer";
      saveData();
      renderAll();
      return;
    }
    const undoBtn = e.target.closest(".undo-carry-btn");
    if (undoBtn) {
      if (!requireAuth()) return;
      const idx = parseInt(undoBtn.dataset.idx, 10);
      const row = data[idx];
      if (!row.sprintHistory || !row.sprintHistory.length) return;
      const previousSprint = row.sprintHistory[row.sprintHistory.length - 1];
      if (undoBtn.dataset.armed === "1") {
        applySprintMove(idx, previousSprint);
        saveData();
        renderAll();
      } else {
        document.querySelectorAll(".undo-carry-btn[data-armed='1']").forEach(b => {
          b.dataset.armed = "0"; b.textContent = "✕"; b.classList.remove("armed");
        });
        undoBtn.dataset.armed = "1";
        undoBtn.textContent = "Confirmar";
        undoBtn.classList.add("armed");
        setTimeout(() => {
          if (undoBtn.dataset.armed === "1") {
            undoBtn.dataset.armed = "0"; undoBtn.textContent = "✕"; undoBtn.classList.remove("armed");
          }
        }, 3000);
      }
      return;
    }
    const btn = e.target.closest(".del-btn");
    if (!btn) return;
    e.preventDefault();
    if (!requireAuth()) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (btn.dataset.armed === "1") {
      data.splice(idx, 1);
      saveData();
      renderAll();
    } else {
      document.querySelectorAll(".del-btn[data-armed='1']").forEach(b => {
        b.dataset.armed = "0"; b.textContent = "✕"; b.classList.remove("armed");
      });
      btn.dataset.armed = "1";
      btn.textContent = "Confirmar";
      btn.classList.add("armed");
      setTimeout(() => {
        if (btn.dataset.armed === "1") {
          btn.dataset.armed = "0"; btn.textContent = "✕"; btn.classList.remove("armed");
        }
      }, 3000);
    }
  });

  document.getElementById("addBtn").addEventListener("click", () => {
    if (!requireAuth()) return;
    data.push({ id: "STRY0000000", tipo: "ENABLER", item: "Novo item do backlog", titulo: "Título sugerido", sprint: selectedSprint || "", sprintHistory: [], projeto: "", ritmId: "", status: "", pend: "" });
    saveData();
    renderAll();
    const rows = document.querySelectorAll("#tableBody input[data-field='id']");
    if (rows.length) { rows[rows.length - 1].focus(); rows[rows.length - 1].select(); }
  });

  const resetBtn = document.getElementById("resetBtn");
  resetBtn.addEventListener("click", () => {
    if (!requireAuth()) return;
    if (resetBtn.dataset.armed === "1") {
      data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      saveData();
      renderAll();
      resetBtn.dataset.armed = "0";
      resetBtn.textContent = "Restaurar Original";
    } else {
      resetBtn.dataset.armed = "1";
      resetBtn.textContent = "Confirmar restauração?";
      setTimeout(() => {
        if (resetBtn.dataset.armed === "1") {
          resetBtn.dataset.armed = "0";
          resetBtn.textContent = "Restaurar Original";
        }
      }, 3000);
    }
  });

  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("filterTipo").addEventListener("change", renderTable);

  document.getElementById("sprintSelect").addEventListener("change", (e) => {
    selectedSprint = e.target.value;
    saveSelectedSprint();
    updateSprintSummary();
    renderAll();
  });
  document.getElementById("prevSprintBtn").addEventListener("click", () => {
    const prev = getPreviousSprintName(selectedSprint);
    if (!prev) return;
    selectedSprint = prev;
    document.getElementById("sprintSelect").value = prev;
    saveSelectedSprint();
    updateSprintSummary();
    renderAll();
  });
  document.getElementById("nextSprintBtn").addEventListener("click", () => {
    const next = getNextSprintName(selectedSprint);
    if (!next) return;
    selectedSprint = next;
    document.getElementById("sprintSelect").value = next;
    saveSelectedSprint();
    updateSprintSummary();
    renderAll();
  });

  const modalOverlay = document.getElementById("sprintModalOverlay");
  document.getElementById("toggleSprintManagerBtn").addEventListener("click", () => {
    modalOverlay.classList.add("open");
  });
  document.getElementById("closeSprintManagerBtn").addEventListener("click", () => {
    modalOverlay.classList.remove("open");
  });
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) { modalOverlay.classList.remove("open"); }
  });

  document.getElementById("addSprintBtn").addEventListener("click", () => {
    if (!requireAuth()) return;
    const nameInput = document.getElementById("newSprintName");
    const startInput = document.getElementById("newSprintStart");
    const endInput = document.getElementById("newSprintEnd");
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const existing = sprints.find(s => s.name === name);
    if (existing) {
      existing.start = startInput.value;
      existing.end = endInput.value;
    } else {
      sprints.push({ name, start: startInput.value, end: endInput.value });
    }
    saveSprints();
    renderSprintSelect();
    renderSprintList();
    renderTable();
    nameInput.value = ""; startInput.value = ""; endInput.value = "";
    nameInput.focus();
  });

  document.getElementById("sprintList").addEventListener("click", (e) => {
    const btn = e.target.closest(".sprint-del-btn");
    if (!btn) return;
    if (!requireAuth()) return;
    const idx = parseInt(btn.dataset.sprintIdx, 10);
    if (btn.dataset.armed === "1") {
      const removedName = sprints[idx].name;
      sprints.splice(idx, 1);
      saveSprints();
      if (selectedSprint === removedName) {
        selectedSprint = "";
        saveSelectedSprint();
      }
      renderSprintSelect();
      renderSprintList();
      renderAll();
    } else {
      document.querySelectorAll(".sprint-del-btn[data-armed='1']").forEach(b => {
        b.dataset.armed = "0"; b.textContent = "✕"; b.classList.remove("armed");
      });
      btn.dataset.armed = "1";
      btn.textContent = "Confirmar";
      btn.classList.add("armed");
      setTimeout(() => {
        if (btn.dataset.armed === "1") {
          btn.dataset.armed = "0"; btn.textContent = "✕"; btn.classList.remove("armed");
        }
      }, 3000);
    }
  });

  // ---- Gerenciar Tipos (CRUD) ----
  const tipoModalOverlay = document.getElementById("tipoModalOverlay");
  const tipoMsg = document.getElementById("tipoManagerMsg");
  let editingTipoName = null;

  function resetTipoForm() {
    document.getElementById("newTipoName").value = "";
    document.getElementById("newTipoBg").value = "#f1f5f9";
    document.getElementById("newTipoTx").value = "#475569";
    document.getElementById("addTipoBtn").textContent = "+ Adicionar Tipo";
    document.getElementById("cancelTipoEditBtn").style.display = "none";
    tipoMsg.textContent = "";
    editingTipoName = null;
  }

  document.getElementById("toggleTipoManagerBtn").addEventListener("click", () => {
    resetTipoForm();
    renderTipoList();
    tipoModalOverlay.classList.add("open");
  });
  document.getElementById("closeTipoManagerBtn").addEventListener("click", () => {
    tipoModalOverlay.classList.remove("open");
  });
  tipoModalOverlay.addEventListener("click", (e) => {
    if (e.target === tipoModalOverlay) { tipoModalOverlay.classList.remove("open"); }
  });
  document.getElementById("cancelTipoEditBtn").addEventListener("click", resetTipoForm);

  document.getElementById("addTipoBtn").addEventListener("click", () => {
    if (!requireAuth()) return;
    const nameInput = document.getElementById("newTipoName");
    const bgInput = document.getElementById("newTipoBg");
    const txInput = document.getElementById("newTipoTx");
    const name = nameInput.value.trim().toUpperCase();
    if (!name) { nameInput.focus(); return; }

    const duplicate = tipos.find(t => t.name === name && t.name !== editingTipoName);
    if (duplicate) {
      tipoMsg.textContent = `Já existe um tipo chamado "${name}".`;
      return;
    }

    if (editingTipoName) {
      const idx = tipos.findIndex(t => t.name === editingTipoName);
      if (idx > -1) {
        tipos[idx] = { name, bg: bgInput.value, tx: txInput.value };
        if (name !== editingTipoName) {
          data.forEach(d => { if (tipoBelongsTo(d.tipo, editingTipoName)) d.tipo = name; });
          saveData();
        }
      }
    } else {
      tipos.push({ name, bg: bgInput.value, tx: txInput.value });
    }
    saveTipos();
    renderTipoList();
    renderTipoFilterOptions();
    renderTable();
    resetTipoForm();
  });

  document.getElementById("tipoList").addEventListener("click", (e) => {
    const editBtn = e.target.closest(".tipo-edit-btn");
    if (editBtn) {
      const idx = parseInt(editBtn.dataset.tipoIdx, 10);
      const t = tipos[idx];
      editingTipoName = t.name;
      document.getElementById("newTipoName").value = t.name;
      document.getElementById("newTipoBg").value = t.bg;
      document.getElementById("newTipoTx").value = t.tx;
      document.getElementById("addTipoBtn").textContent = "Salvar edição";
      document.getElementById("cancelTipoEditBtn").style.display = "inline-block";
      tipoMsg.textContent = "";
      return;
    }
    const delBtn = e.target.closest(".tipo-del-btn");
    if (delBtn) {
      if (!requireAuth()) return;
      const idx = parseInt(delBtn.dataset.tipoIdx, 10);
      const t = tipos[idx];
      const usageCount = data.filter(d => tipoBelongsTo(d.tipo, t.name)).length;
      if (usageCount > 0) {
        tipoMsg.textContent = `Não é possível excluir "${t.name}": ${usageCount} item(ns) ainda usam este tipo.`;
        return;
      }
      if (delBtn.dataset.armed === "1") {
        tipos.splice(idx, 1);
        saveTipos();
        renderTipoList();
        renderTipoFilterOptions();
        if (editingTipoName === t.name) resetTipoForm();
      } else {
        document.querySelectorAll(".tipo-del-btn[data-armed='1']").forEach(b => {
          b.dataset.armed = "0"; b.textContent = "✕"; b.classList.remove("armed");
        });
        delBtn.dataset.armed = "1";
        delBtn.textContent = "Confirmar";
        delBtn.classList.add("armed");
        tipoMsg.textContent = "";
        setTimeout(() => {
          if (delBtn.dataset.armed === "1") {
            delBtn.dataset.armed = "0"; delBtn.textContent = "✕"; delBtn.classList.remove("armed");
          }
        }, 3000);
      }
    }
  });

  // ---- Backup: exportar / importar ----
  document.getElementById("exportBackupBtn").addEventListener("click", () => {
    if (typeof XLSX === "undefined") {
      alert("Biblioteca XLSX não carregou.");
      return;
    }
    const backlogRows = data.map(d => ({
      "ID": d.id,
      "Tipo": d.tipo,
      "Descrição Técnica": d.item,
      "Título": d.titulo,
      "Sprint": d.sprint,
      "Projeto": d.projeto,
      "Identificador RITM": d.ritmId || "",
      "Status": d.status,
      "Pendência": d.pend,
      "Histórico de Sprints": Array.isArray(d.sprintHistory) ? d.sprintHistory.join(" → ") : "",
    }));
    const sprintRows = sprints.map(s => ({ "Nome": s.name, "Início": s.start || "", "Fim": s.end || "" }));
    const tipoRows = tipos.map(t => ({ "Nome": t.name, "Cor de Fundo": t.bg, "Cor do Texto": t.tx }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(backlogRows), "Backlog");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sprintRows), "Sprints");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tipoRows), "Tipos");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `painel-backlog-backup-${stamp}.xlsx`);
  });

  document.getElementById("importSprintBtn").addEventListener("click", () => {
    if (!requireAuth("Entre com sua conta para importar.")) return;
    document.getElementById("importSprintFileInput").click();
  });
  document.getElementById("importSprintFileInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!requireAuth("Entre com sua conta para importar.")) { e.target.value = ""; return; }
    const reader2 = new FileReader();
    reader2.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        importSpreadsheetRows(rows);
      } catch (err) {
        console.error("Erro ao importar planilha:", err);
        alert("Não foi possível ler o arquivo. Verifique se é uma planilha Excel/CSV válida.");
      }
      e.target.value = "";
    };
    reader2.readAsArrayBuffer(file);
  });

  /* ---- Autenticação ---- */
  document.getElementById("authActionBtn").addEventListener("click", async () => {
    if (currentUser) {
      try { await signOut(auth); }
      catch (e) { console.error(e); }
      return;
    }
    document.getElementById("loginError").textContent = "";
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPassword").value = "";
    document.getElementById("loginModalOverlay").classList.add("open");
    document.getElementById("loginEmail").focus();
  });

  document.getElementById("closeLoginModalBtn").addEventListener("click", () => {
    document.getElementById("loginModalOverlay").classList.remove("open");
  });

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const loginError = document.getElementById("loginError");
    const submitBtn = document.getElementById("loginSubmitBtn");
    loginError.textContent = "";
    submitBtn.disabled = true;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      document.getElementById("loginModalOverlay").classList.remove("open");
    } catch (err) {
      console.error(err);
      loginError.textContent = authErrorMessage(err);
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("forgotPasswordLink").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const loginError = document.getElementById("loginError");
    if (!email) {
      loginError.textContent = "Digite seu e-mail no campo acima primeiro.";
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      loginError.textContent = "Enviamos um e-mail para " + email + " com o link de redefinição de senha.";
    } catch (err) {
      console.error(err);
      loginError.textContent = authErrorMessage(err);
    }
  });
}

/* =========================================================================
   IMPORTAÇÃO DE PLANILHA (Excel/SPM)
========================================================================= */

function normalizeHeader(h) {
  return (h || "").toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildImportKeyMap(sampleRow) {
  const keyMap = {};
  Object.keys(sampleRow).forEach(k => {
    const nk = normalizeHeader(k);
    if (["id", "story id", "story_id", "stry"].includes(nk)) keyMap.id = k;
    else if (nk === "projeto") keyMap.projeto = k;
    else if (nk === "sprint") keyMap.sprint = k;
    else if (nk === "status") keyMap.status = k;
    else if (nk === "tipo") keyMap.tipo = k;
    else if (["pendencia", "pendencias"].includes(nk)) keyMap.pend = k;
    else if (["identificador ritm", "identificador", "ritm", "ritm id"].includes(nk)) keyMap.ritmId = k;
    else if (["item", "item do backlog tecnico", "backlog tecnico", "backlog técnico", "descricao tecnica", "descrição técnica"].includes(nk)) keyMap.item = k;
    else if (["titulo", "titulo sugerido", "titulo sugerido funcional", "titulo sugerido / funcional"].includes(nk)) keyMap.titulo = k;
  });
  return keyMap;
}

function importSpreadsheetRows(rows) {
  if (!rows || !rows.length) {
    alert("A planilha está vazia ou não foi possível ler nenhuma linha.");
    return;
  }
  const keyMap = buildImportKeyMap(rows[0]);
  if (!keyMap.id) {
    alert('Não encontrei uma coluna "ID" na planilha. Verifique o cabeçalho das colunas.');
    return;
  }

  let added = 0, updated = 0;
  rows.forEach(r => {
    const idVal = (keyMap.id ? r[keyMap.id] : "").toString().trim();
    if (!idVal) return;

    const tipoVal = keyMap.tipo ? r[keyMap.tipo].toString().trim() : "";
    const sprintVal = keyMap.sprint ? r[keyMap.sprint].toString().trim() : "";
    const statusVal = keyMap.status ? r[keyMap.status].toString().trim() : "";
    const projetoVal = keyMap.projeto ? r[keyMap.projeto].toString().trim() : "";
    const pendVal = keyMap.pend ? r[keyMap.pend].toString().trim() : "";
    const ritmVal = keyMap.ritmId ? r[keyMap.ritmId].toString().trim() : "";
    const itemVal = keyMap.item ? r[keyMap.item].toString() : "";
    const tituloVal = keyMap.titulo ? r[keyMap.titulo].toString() : "";

    if (sprintVal && !sprints.some(s => s.name === sprintVal)) {
      sprints.push({ name: sprintVal, start: "", end: "" });
    }
    if (tipoVal && !tipos.some(t => t.name === tipoVal || tipoBelongsTo(tipoVal, t.name))) {
      tipos.push({ name: tipoVal, bg: "#f1f5f9", tx: "#475569" });
    }

    const existing = data.find(d => d.id === idVal);
    if (existing) {
      if (tipoVal) existing.tipo = tipoVal;
      if (sprintVal) existing.sprint = sprintVal;
      if (statusVal) existing.status = statusVal;
      if (projetoVal) existing.projeto = projetoVal;
      if (pendVal) existing.pend = pendVal;
      if (ritmVal) existing.ritmId = ritmVal;
      if (itemVal) existing.item = itemVal;
      if (tituloVal) existing.titulo = tituloVal;
      updated++;
    } else {
      data.push({
        id: idVal,
        tipo: tipoVal || "ENABLER",
        item: itemVal,
        titulo: tituloVal,
        sprint: sprintVal,
        sprintHistory: [],
        projeto: projetoVal,
        ritmId: ritmVal,
        status: statusVal,
        pend: pendVal,
      });
      added++;
    }
  });

  saveData();
  saveSprints();
  saveTipos();
  renderSprintSelect();
  renderSprintList();
  renderTipoFilterOptions();
  renderTipoList();
  renderAll();

  const pill = document.getElementById("savePill");
  pill.textContent = `Importado: ${added} novo(s), ${updated} atualizado(s) ✓`;
  pill.classList.add("show");
  setTimeout(() => { pill.classList.remove("show"); pill.textContent = "Salvo ✓"; }, 3500);
}

/* =========================================================================
   FIREBASE — AUTENTICAÇÃO E SINCRONIZAÇÃO EM TEMPO REAL
========================================================================= */

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  const statusText = document.getElementById("authStatusText");
  const actionBtn = document.getElementById("authActionBtn");
  if (statusText) statusText.textContent = user ? (user.email || "Autenticado") : "Não autenticado";
  if (actionBtn) actionBtn.textContent = user ? "Sair" : "Entrar";

  // Reflete o estado de autenticação nos controles da tela (campos ficam
  // somente leitura para quem não está logado).
  if (eventsAttached) {
    renderTableHeader();
    renderAll();
  }
});

onSnapshot(
  stateRef,
  handleSnapshot,
  (err) => {
    console.error(err);
    const statusText = document.getElementById("authStatusText");
    if (statusText) statusText.textContent = "Erro ao acessar Firebase";
    alert(
      "Não foi possível acessar o Firestore. Confira as regras do banco e os domínios autorizados.\n\n" + err.message
    );
  }
);
