import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, onSnapshot, setDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const stateRef = doc(db, "backlog_data", "main_state");

let state = {
  items: [],
  sprints: [],
  tipos: [],
  columnOrder: ["id","projeto","sprint","tipo","status","titulo","descricao","responsavel","dataInicio","dataFim"]
};
let currentUser = null;
let selectedSprint = "";
let selectedTipo = "";
let searchTerm = "";
let saveTimer;

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defaults = {
  tipos: [
    {name:"Sustentação", bg:"#fee2e2", tx:"#b91c1c"},
    {name:"Melhoria", bg:"#e3ecfa", tx:"#0b3d91"},
    {name:"Demanda", bg:"#f1e9fb", tx:"#6d28d9"}
  ],
  columns: [
    ["id","ID"],["projeto","Projeto"],["sprint","Sprint"],["tipo","Tipo"],["status","Status"],
    ["titulo","Título"],["descricao","Descrição"],["responsavel","Responsável"],
    ["dataInicio","Início"],["dataFim","Fim"]
  ]
};

function normalize(raw={}) {
  state = {
    ...raw,
    items: Array.isArray(raw.items) ? raw.items : [],
    sprints: Array.isArray(raw.sprints) ? raw.sprints : [],
    tipos: Array.isArray(raw.tipos) && raw.tipos.length ? raw.tipos : defaults.tipos,
    columnOrder: Array.isArray(raw.columnOrder) && raw.columnOrder.length ? raw.columnOrder : defaults.columns.map(x=>x[0])
  };
}
function canEdit(){ return !!currentUser; }
function showSaved(text="Salvo ✓"){
  const p=$("savePill"); if(!p)return; p.textContent=text; p.classList.add("show");
  clearTimeout(saveTimer); saveTimer=setTimeout(()=>p.classList.remove("show"),1600);
}
async function persist(){
  if(!canEdit()) return;
  await setDoc(stateRef, {...state, updatedAt:new Date().toISOString(), updatedBy:currentUser.email||currentUser.uid}, {merge:true});
  showSaved();
}
function nextId(){
  const nums=state.items.map(x=>parseInt(String(x.id||"").replace(/\D/g,""),10)).filter(Number.isFinite);
  return String((nums.length?Math.max(...nums):0)+1);
}
function sprintNames(){
  return state.sprints.map(s=>typeof s==="string"?s:(s.name||s.nome||"")).filter(Boolean);
}
function typeNames(){ return state.tipos.map(t=>typeof t==="string"?t:t.name).filter(Boolean); }
function options(values, selected){
  return `<option value=""></option>`+values.map(v=>`<option ${v===selected?"selected":""}>${esc(v)}</option>`).join("");
}
function statuses(){ return ["A Fazer","Em Andamento","Bloqueado","Concluído","Cancelado"]; }

function renderAll(){
  renderSprintNav(); renderTypesFilter(); renderTable(); renderStats(); renderSummary(); renderManagers();
}
function renderSprintNav(){
  const el=$("sprintSelect"); if(!el)return;
  el.innerHTML='<option value="">Todos os itens</option>'+sprintNames().map(n=>`<option value="${esc(n)}" ${n===selectedSprint?"selected":""}>${esc(n)}</option>`).join("");
  const sp=state.sprints.find(s=>(typeof s==="string"?s:(s.name||s.nome))===selectedSprint);
  $("sprintDateBadge").textContent = sp && typeof sp==="object" ? [sp.start||sp.inicio,sp.end||sp.fim].filter(Boolean).join(" → ") || "—" : "—";
}
function renderTypesFilter(){
  $("filterTipo").innerHTML='<option value="">Todos os tipos</option>'+typeNames().map(n=>`<option value="${esc(n)}" ${n===selectedTipo?"selected":""}>${esc(n)}</option>`).join("");
}
function filteredItems(){
  const q=searchTerm.toLowerCase();
  return state.items.filter(i=>{
    const sprintOk=!selectedSprint || i.sprint===selectedSprint;
    const typeOk=!selectedTipo || i.tipo===selectedTipo;
    const textOk=!q || Object.values(i).some(v=>String(v??"").toLowerCase().includes(q));
    return sprintOk && typeOk && textOk;
  });
}
function renderTable(){
  const labels=Object.fromEntries(defaults.columns);
  const cols=state.columnOrder.filter(c=>labels[c]);
  $("tableHead").innerHTML="<tr>"+cols.map(c=>`<th class="col-draggable">${esc(labels[c])}</th>`).join("")+"<th>Ações</th></tr>";
  $("tableBody").innerHTML=filteredItems().map(item=>{
    const idx=state.items.indexOf(item);
    return `<tr>${cols.map(c=>cell(item,idx,c)).join("")}
      <td><button class="del-btn" data-delete="${idx}" title="Excluir">✕</button></td></tr>`;
  }).join("");
  $("tableBody").querySelectorAll("[data-field]").forEach(el=>{
    el.addEventListener("change", async e=>{
      const i=+e.target.dataset.index, f=e.target.dataset.field;
      state.items[i][f]=e.target.value;
      await persist(); renderStats(); renderSummary();
    });
  });
  $("tableBody").querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{
    if(!canEdit()) return alert("Entre com sua conta para editar.");
    if(confirm("Excluir este item?")){ state.items.splice(+b.dataset.delete,1); await persist(); renderAll(); }
  });
}
function cell(item,idx,c){
  const common=`data-index="${idx}" data-field="${c}" ${canEdit()?"":"disabled"}`;
  if(c==="tipo") return `<td><select class="tipo-select" ${common}>${options(typeNames(),item[c])}</select></td>`;
  if(c==="status") return `<td><select class="status-select" ${common}>${options(statuses(),item[c])}</select></td>`;
  if(c==="sprint") return `<td><select class="sprint-select" ${common}>${options(sprintNames(),item[c])}</select></td>`;
  if(c==="descricao") return `<td><textarea ${common}>${esc(item[c])}</textarea></td>`;
  return `<td><input ${common} value="${esc(item[c])}"></td>`;
}
function renderStats(){
  const statsContainer = $("statsRow")?.closest(".stats-section") \vert{}\vert{} $("statsRow");
  if (!selectedSprint) {
    if (statsContainer) statsContainer.style.display = "none";
    return;
  }
  if (statsContainer) statsContainer.style.display = "";

  const items=filteredItems(), total=items.length;
  const done=items.filter(x=>String(x.status).toLowerCase().includes("conclu")).length;
  const doing=items.filter(x=>String(x.status).toLowerCase().includes("andamento")).length;
  const todo=items.filter(x=>String(x.status).toLowerCase().includes("fazer")).length;
  const cards=[["Total",total,"icon-blue"],["A Fazer",todo,"icon-amber"],["Em Andamento",doing,"icon-purple"],["Concluídos",done,"icon-green"]];
  $("statsRow").innerHTML=cards.map(([l,v,cl])=>`<div class="stat-card"><div class="stat-icon ${cl}">●</div><div class="stat-body"><div class="label">${l}</div><div class="value-row"><div class="value">${v}</div><div class="pct">${total?Math.round(v/total*100):0}%</div></div><div class="bar-track"><div class="bar-fill ${cl}-bar" style="width:${total?v/total*100:0}%"></div></div></div></div>`).join("");
}

function renderSummary(){
  const summaryContainer = $("sprintSummary")?.closest(".summary-section") \vert{}\vert{} $("sprintSummary");
  if (!selectedSprint) {
    if (summaryContainer) summaryContainer.style.display = "none";
    return;
  }
  if (summaryContainer) summaryContainer.style.display = "";

  const items=filteredItems();
  const projects=new Set(items.map(x=>x.projeto).filter(Boolean)).size;
  $("sprintSummary").innerHTML=`<div class="metric-card"><div class="metric-text"><div class="metric-label">Sprint selecionada</div><div class="metric-value">${esc(selectedSprint||"Todas")}</div><div class="metric-sub">${items.length} item(ns)</div></div></div>
  <div class="metric-card"><div class="metric-text"><div class="metric-label">Projetos</div><div class="metric-value">${projects}</div><div class="metric-sub">no filtro atual</div></div></div>`;
}
function renderManagers(){
  $("sprintList").innerHTML=state.sprints.map((s,i)=>{
    const n=typeof s==="string"?s:(s.name||s.nome||"");
    const dates=typeof s==="object"?[s.start||s.inicio,s.end||s.fim].filter(Boolean).join(" → "):"";
    return `<div class="sprint-list-row"><span class="sp-name">${esc(n)}</span><span class="sp-dates">${esc(dates)}</span><button class="del-btn" data-delsprint="${i}">✕</button></div>`;
  }).join("");
  $("tipoList").innerHTML=state.tipos.map((t,i)=>{
    const n=typeof t==="string"?t:t.name;
    return `<div class="sprint-list-row"><span class="sp-name">${esc(n)}</span><span class="sp-dates"></span><button class="del-btn" data-deltype="${i}">✕</button></div>`;
  }).join("");
  document.querySelectorAll("[data-delsprint]").forEach(b=>b.onclick=async()=>{state.sprints.splice(+b.dataset.delsprint,1);await persist();renderAll();});
  document.querySelectorAll("[data-deltype]").forEach(b=>b.onclick=async()=>{state.tipos.splice(+b.dataset.deltype,1);await persist();renderAll();});
}

$("addBtn").onclick=async()=>{
  if(!canEdit()) return alert("Entre com sua conta para editar.");
  state.items.push({id:nextId(),projeto:"",sprint:selectedSprint||"",tipo:"",status:"A Fazer",titulo:"Novo item",descricao:"",responsavel:"",dataInicio:"",dataFim:""});
  await persist(); renderAll();
};
$("searchInput").oninput=e=>{searchTerm=e.target.value;renderTable();renderStats();renderSummary();};
$("filterTipo").onchange=e=>{selectedTipo=e.target.value;renderAll();};
$("sprintSelect").onchange=e=>{selectedSprint=e.target.value;renderAll();};
$("prevSprintBtn").onclick=()=>moveSprint(-1);
$("nextSprintBtn").onclick=()=>moveSprint(1);
function moveSprint(d){
  const a=sprintNames(); if(!a.length)return;
  let i=a.indexOf(selectedSprint); i=i<0?(d>0?0:a.length-1):(i+d+a.length)%a.length;
  selectedSprint=a[i]; renderAll();
}
$("settingsBtn").onclick=e=>{e.stopPropagation();$("settingsMenu").classList.toggle("open");};
document.addEventListener("click",e=>{if(!e.target.closest(".settings-dropdown"))$("settingsMenu").classList.remove("open");});
$("toggleSprintManagerBtn").onclick=()=>$("sprintModalOverlay").classList.add("open");
$("toggleTipoManagerBtn").onclick=()=>$("tipoModalOverlay").classList.add("open");
$("closeSprintManagerBtn").onclick=()=>$("sprintModalOverlay").classList.remove("open");
$("closeTipoManagerBtn").onclick=()=>$("tipoModalOverlay").classList.remove("open");
$("addSprintBtn").onclick=async()=>{
  if(!canEdit())return alert("Entre para editar.");
  const name=$("newSprintName").value.trim(); if(!name)return;
  const obj={name,start:$("newSprintStart").value,end:$("newSprintEnd").value};
  const i=state.sprints.findIndex(s=>(typeof s==="string"?s:(s.name||s.nome))===name);
  i>=0?state.sprints.splice(i,1,obj):state.sprints.push(obj);
  await persist(); renderAll();
};
$("addTipoBtn").onclick=async()=>{
  if(!canEdit())return alert("Entre para editar.");
  const name=$("newTipoName").value.trim(); if(!name)return;
  state.tipos.push({name,bg:$("newTipoBg").value,tx:$("newTipoTx").value}); await persist(); renderAll();
};
$("resetColumnsBtn").onclick=async()=>{state.columnOrder=defaults.columns.map(x=>x[0]);await persist();renderAll();};
$("resetBtn").onclick=async()=>{if(confirm("Restaurar estrutura padrão? Os itens atuais serão mantidos.")){state.tipos=defaults.tipos;state.columnOrder=defaults.columns.map(x=>x[0]);await persist();renderAll();}};

$("exportBackupBtn").onclick=()=>{
  if(typeof XLSX==="undefined")return alert("Biblioteca XLSX não carregou.");
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.items),"Backlog");
  XLSX.writeFile(wb,"backlog-backup.xlsx");
};
$("importSprintBtn").onclick=()=>$("importSprintFileInput").click();
$("importSprintFileInput").onchange=async e=>{
  if(!canEdit())return alert("Entre para importar.");
  const f=e.target.files[0]; if(!f)return;
  const data=await f.arrayBuffer(), wb=XLSX.read(data), rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
  if(!rows.length)return alert("Planilha vazia.");
  state.items=rows.map((r,i)=>({
    id:String(r.id||r.ID||nextId()), projeto:r.projeto||r.Projeto||"", sprint:r.sprint||r.Sprint||"",
    tipo:r.tipo||r.Tipo||"", status:r.status||r.Status||"A Fazer", titulo:r.titulo||r.Título||r.Titulo||"",
    descricao:r.descricao||r.Descrição||r.Descricao||"", responsavel:r.responsavel||r.Responsável||r.Responsavel||"",
    dataInicio:r.dataInicio||r.Início||r.Inicio||"", dataFim:r.dataFim||r.Fim||""
  }));
  await persist(); renderAll();
};

// Mensagens de erro do Firebase Auth traduzidas para algo que a pessoa entenda
function authErrorMessage(e){
  const map={
    "auth/invalid-email":"E-mail inválido.",
    "auth/user-disabled":"Este usuário foi desativado.",
    "auth/user-not-found":"E-mail ou senha incorretos.",
    "auth/wrong-password":"E-mail ou senha incorretos.",
    "auth/invalid-credential":"E-mail ou senha incorretos.",
    "auth/too-many-requests":"Muitas tentativas. Aguarde um pouco e tente de novo.",
    "auth/missing-password":"Digite a senha."
  };
  return map[e.code] || ("Falha na autenticação: "+e.message);
}

$("authActionBtn").onclick=async()=>{
  if(currentUser){
    try{ await signOut(auth); } catch(e){ console.error(e); }
    return;
  }
  $("loginError").textContent="";
  $("loginEmail").value=""; $("loginPassword").value="";
  $("loginModalOverlay").classList.add("open");
  $("loginEmail").focus();
};
$("closeLoginModalBtn").onclick=()=>$("loginModalOverlay").classList.remove("open");
$("loginForm").onsubmit=async(e)=>{
  e.preventDefault();
  const email=$("loginEmail").value.trim();
  const password=$("loginPassword").value;
  $("loginError").textContent="";
  $("loginSubmitBtn").disabled=true;
  try{
    await signInWithEmailAndPassword(auth,email,password);
    $("loginModalOverlay").classList.remove("open");
  }catch(err){
    console.error(err);
    $("loginError").textContent=authErrorMessage(err);
  }finally{
    $("loginSubmitBtn").disabled=false;
  }
};
$("forgotPasswordLink").onclick=async(e)=>{
  e.preventDefault();
  const email=$("loginEmail").value.trim();
  if(!email) return $("loginError").textContent="Digite seu e-mail no campo acima primeiro.";
  try{
    await sendPasswordResetEmail(auth,email);
    $("loginError").textContent="Enviamos um e-mail para "+email+" com o link de redefinição de senha.";
  }catch(err){
    console.error(err);
    $("loginError").textContent=authErrorMessage(err);
  }
};

onAuthStateChanged(auth,user=>{
  currentUser=user;
  $("authStatusText").textContent=user?(user.email||"Autenticado"):"Não autenticado";
  $("authActionBtn").textContent=user?"Sair":"Entrar";
  renderAll();
});

onSnapshot(stateRef, snap=>{
  normalize(snap.exists()?snap.data():{});
  renderAll();
}, err=>{
  console.error(err);
  $("authStatusText").textContent="Erro ao acessar Firebase";
  alert("Não foi possível acessar o Firestore. Confira as regras do banco e os domínios autorizados.\n\n"+err.message);
});
