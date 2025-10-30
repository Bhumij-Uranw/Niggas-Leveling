/* ---------------- Firebase ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAmb2jCnYlyUinXsQtEoY7GmuJ1vgEHuqE",
  authDomain: "xp-ngleveling.firebaseapp.com",
  projectId: "xp-ngleveling",
  storageBucket: "xp-ngleveling.firebasestorage.app",
  messagingSenderId: "1095060275934",
  appId: "1:1095060275934:web:525b8458ab7a5a315db84f"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ---------------- Globals ---------------- */
let students = [];
let activeStudentId = null;

/* ---------------- Utilities ---------------- */
function cryptoRandomId(){return "s_"+Math.random().toString(36).slice(2)+Date.now().toString(36);}
function calcLevel(totalXP){
  let level=1, req=100, left=totalXP;
  while(left>=req){left-=req;level++;req+=50;}
  return { level, currentXP:left, xpNeeded:req };
}
function todayStr(){ return new Date().toDateString(); }

/* ---------------- DOM Elements ---------------- */
const loadingScreen = document.getElementById("loadingScreen");
const studentsView = document.getElementById("studentsView");
const studentView  = document.getElementById("studentView");
const studentsTbody = document.getElementById("studentsTbody");

const addStudentBtn = document.getElementById("addStudentBtn");
const backBtn = document.getElementById("backBtn");
const studentNameInput = document.getElementById("studentNameInput");
const levelBadge = document.getElementById("levelBadge");
const xpNow = document.getElementById("xpNow");
const xpNext = document.getElementById("xpNext");
const streakBadge = document.getElementById("streakBadge");
const xpBarFill = document.getElementById("xpBarFill");

const taskNameInput = document.getElementById("taskName");
const taskXPInput   = document.getElementById("taskXP");
const addTaskBtn    = document.getElementById("addTaskBtn");
const taskListEl    = document.getElementById("taskList");

const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

/* ---------------- Models ---------------- */
function makeStudent(name){ 
  return { 
    id: cryptoRandomId(), 
    name, 
    totalXP:0, 
    tasks:[], 
    streak:0, 
    lastActive:null 
  }; 
}
async function saveStudent(student){ await db.collection("students").doc(student.id).set(student); }

/* ---------------- Render ---------------- */
function renderStudentsTable(){
  studentsTbody.innerHTML="";
  // Sort by level and XP
  students.sort((a,b)=>b.totalXP - a.totalXP);
  students.forEach((s,i)=>{
    const { level, currentXP, xpNeeded } = calcLevel(s.totalXP);
    const tr = document.createElement("tr");
    const rankTd = document.createElement("td");
    rankTd.innerHTML = `${i+1}${i===0?' 👑':''}`;
    tr.innerHTML = `
      <td>${rankTd.innerHTML}</td>
      <td><input class="name-inline" value="${s.name}" onchange="updateName('${s.id}', this.value)" /></td>
      <td>Lv ${level}</td>
      <td>${currentXP}</td>
      <td>${xpNeeded}</td>
      <td>${s.streak || 0}</td>
      <td><button class="btn primary" onclick="openStudentView('${s.id}')">Open</button></td>
      <td><button class="btn danger" onclick="deleteStudent('${s.id}')">Delete</button></td>
    `;
    studentsTbody.appendChild(tr);
  });
}

function renderStudentStats(student){
  const { level, currentXP, xpNeeded } = calcLevel(student.totalXP);
  levelBadge.textContent = `Lv ${level}`;
  xpNow.textContent = `${currentXP} XP`;
  xpNext.textContent = `/ ${xpNeeded} to next`;
  xpBarFill.style.width = `${(currentXP/xpNeeded)*100}%`;
  streakBadge.textContent = `🔥 ${student.streak || 0} Streak`;
}

function renderTaskList(student){
  taskListEl.innerHTML="";
  student.tasks.forEach(t=>{
    const div = document.createElement("div");
    div.className="task-item";
    div.innerHTML = `
      <div><strong>${t.name}</strong> <span class="muted">${t.xp} XP</span></div>
      <div>
        ${t.status!=="Done" ? `<button class="btn primary" onclick="markDone('${student.id}','${t.id}')">Done</button>` : `<span class="status done">Done</span>`}
        <button class="btn danger" onclick="deleteTask('${student.id}','${t.id}')">Del</button>
      </div>`;
    taskListEl.appendChild(div);
  });
}

/* ---------------- Actions ---------------- */
window.updateName = async (id, name)=>{
  const s = students.find(st=>st.id===id);
  if(!s) return;
  s.name=name.trim();
  await saveStudent(s);
};

window.deleteStudent = async (id)=>{
  if(!confirm("Delete this player?")) return;
  await db.collection("students").doc(id).delete();
};

window.openStudentView = (id)=>{
  activeStudentId=id;
  const s = students.find(st=>st.id===id);
  studentNameInput.value = s.name;
  renderStudentStats(s);
  renderTaskList(s);
  studentsView.classList.remove("active");
  studentView.classList.add("active");
};

backBtn.onclick=()=>{ 
  studentView.classList.remove("active");
  studentsView.classList.add("active");
  renderStudentsTable();
};

addStudentBtn.onclick=async ()=>{
  const s = makeStudent(`Player ${students.length+1}`);
  await saveStudent(s);
};

addTaskBtn.onclick=async ()=>{
  const s = students.find(st=>st.id===activeStudentId);
  if(!s) return;
  const name = taskNameInput.value.trim();
  const xp = Number(taskXPInput.value||0);
  if(!name||xp<=0) return;
  const task = {id:cryptoRandomId(),name,xp,status:"In Progress",createdAt:Date.now()};
  s.tasks.push(task);
  await saveStudent(s);
  renderTaskList(s);
};

window.markDone = async (sid,tid)=>{
  const s = students.find(st=>st.id===sid);
  const t = s.tasks.find(tt=>tt.id===tid);
  if(!t) return;
  t.status="Done";
  s.totalXP += t.xp;

  const last = s.lastActive ? new Date(s.lastActive).toDateString() : null;
  const today = todayStr();
  if(last !== today){
    s.streak = (last && (new Date(today) - new Date(last)) <= 86400000) ? (s.streak||0)+1 : 1;
    s.lastActive = new Date().toISOString();
  }
  await saveStudent(s);
  renderTaskList(s);
  renderStudentStats(s);
};

window.deleteTask = async (sid,tid)=>{
  const s = students.find(st=>st.id===sid);
  s.tasks = s.tasks.filter(tt=>tt.id!==tid);
  await saveStudent(s);
  renderTaskList(s);
};

/* ---------------- Chat ---------------- */
sendChatBtn.onclick=async ()=>{
  const msg = chatInput.value.trim();
  if(!msg) return;
  await db.collection("chat").add({text:msg,timestamp:Date.now()});
  chatInput.value="";
};
function renderChat(snapshot){
  chatBox.innerHTML="";
  snapshot.forEach(doc=>{
    const d = doc.data();
    const div = document.createElement("div");
    div.className="chat-msg";
    div.textContent = d.text;
    chatBox.appendChild(div);
  });
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* ---------------- Init ---------------- */
async function init(){
  try {
    const snapshot = await db.collection("students").get();
    students = snapshot.docs.map(d=>d.data());
  } catch(err){
    console.error(err);
  } finally {
    loadingScreen.style.display="none";
  }

  renderStudentsTable();

  db.collection("students").onSnapshot(snap=>{
    students = snap.docs.map(d=>d.data());
    if(studentView.classList.contains("active")){
      const s = students.find(st=>st.id===activeStudentId);
      if(s){ renderStudentStats(s); renderTaskList(s); }
    } else renderStudentsTable();
  });

  db.collection("chat").orderBy("timestamp").onSnapshot(renderChat);
}
init();
