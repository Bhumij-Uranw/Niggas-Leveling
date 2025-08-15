/* ---------------- Loading ---------------- */
const loadingScreen = document.getElementById("loadingScreen");
function hideLoading(){ loadingScreen.style.display="none"; }

/* ---------------- Models ---------------- */
let students = [];
let activeStudentId = null;

/* ---------------- Utilities ---------------- */
function cryptoRandomId(){return "s_"+Math.random().toString(36).slice(2)+Date.now().toString(36);}
function el(tag, child){const e=document.createElement(tag);if(child)e.appendChild(child);return e;}
function text(s){return document.createTextNode(s);}
function button(label, kind){const b=document.createElement("button");b.className="btn"+(kind?" "+kind:"");b.textContent=label;return b;}

/* ---------------- XP / Level ---------------- */
function calcLevel(totalXP){
  let level=1, req=100, left=totalXP;
  while(left>=req){
    left-=req;
    level++;
    if(level<3) req=100;
    else if(level<10) req=200;
    else req=300;
  }
  return { level, currentXP:left, xpNeeded:req };
}

/* ---------------- DOM ---------------- */
const studentsView = document.getElementById("studentsView");
const studentView  = document.getElementById("studentView");
const studentsTbody = document.getElementById("studentsTbody");
const addStudentBtn = document.getElementById("addStudentBtn");
const backBtn       = document.getElementById("backBtn");

const studentNameInput = document.getElementById("studentNameInput");
const levelBadge       = document.getElementById("levelBadge");
const xpNow            = document.getElementById("xpNow");
const xpNext           = document.getElementById("xpNext");
const xpBarFill        = document.getElementById("xpBarFill");

const taskNameInput = document.getElementById("taskName");
const taskXPInput   = document.getElementById("taskXP");
const addTaskBtn    = document.getElementById("addTaskBtn");
const taskListEl    = document.getElementById("taskList");

/* ---------------- CHAT DOM ---------------- */
const chatBox      = document.getElementById("chatBox");
const chatInput    = document.getElementById("chatInput");
const sendChatBtn  = document.getElementById("sendChatBtn");

/* ---------------- Firebase Functions ---------------- */
async function loadStudents(){
  const snapshot = await db.collection("students").get();
  let studentsArr = snapshot.docs.map(doc=>doc.data());
  if(studentsArr.length === 0){
    const defaults = [
      makeStudent("Student 1"),
      makeStudent("Student 2"),
      makeStudent("Student 3"),
      makeStudent("Student 4")
    ];
    for(const s of defaults) await db.collection("students").doc(s.id).set(s);
    studentsArr = defaults;
  }
  return studentsArr;
}

function makeStudent(name){ return { id: cryptoRandomId(), name, totalXP:0, tasks:[] }; }
async function saveStudent(student){ await db.collection("students").doc(student.id).set(student); }
async function deleteStudent(student){ await db.collection("students").doc(student.id).delete(); }

/* ---------------- Render ---------------- */
function renderStudentsTable(){
  studentsTbody.innerHTML="";
  students.forEach(s=>{
    const { level, currentXP, xpNeeded } = calcLevel(s.totalXP);
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.className="name-inline";
    nameInput.value = s.name;
    nameInput.onchange=async ()=>{ s.name=nameInput.value.trim()||"Untitled"; await saveStudent(s); };
    nameTd.appendChild(nameInput);

    const levelTd = el("td", text(`Lv ${level}`));
    const xpTd    = el("td", text(`${currentXP}`));
    const needTd  = el("td", text(`${xpNeeded}`));

    const openTd = el("td", button("Open","primary"));
    openTd.firstChild.onclick=()=>{ openStudentView(s.id); };

    const deleteTd = el("td", button("Delete","danger"));
    deleteTd.firstChild.onclick=async ()=>{
      if(confirm(`Delete ${s.name}?`)){
        await deleteStudent(s);
        students = students.filter(st=>st.id!==s.id);
        renderStudentsTable();
      }
    };

    tr.append(nameTd,levelTd,xpTd,needTd,openTd,deleteTd);
    studentsTbody.appendChild(tr);
  });
}

function renderStudentStats(student){
  const { level, currentXP, xpNeeded } = calcLevel(student.totalXP);
  levelBadge.textContent=`Lv ${level}`;
  xpNow.textContent=`${currentXP} XP`;
  xpNext.textContent=`/ ${xpNeeded} to next`;
  xpBarFill.style.width=`${Math.min(100,(currentXP/xpNeeded*100))}%`;
}

function renderTaskList(student){
  const tasks=[...student.tasks].sort((a,b)=>b.createdAt-a.createdAt);
  taskListEl.innerHTML="";
  tasks.forEach(task=>{
    const row = el("div"); row.className="task-item";

    const left = el("div"); left.className="task-left";
    const title = el("div"); title.className="task-title"; title.textContent=task.name;
    const meta  = el("div"); meta.className="task-meta"; meta.textContent=`${task.xp} XP`;
    const status= el("span"); status.className="status "+(task.status==="Done"?"done":"progress"); status.textContent=task.status;
    left.append(status,title,meta);

    const btns = el("div"); btns.className="btn-row";
    if(task.status!=="Done"){
      const doneBtn = button("Done","primary");
      doneBtn.onclick=async ()=>{
        task.status="Done"; student.totalXP+=Number(task.xp);
        await saveStudent(student); renderTaskList(student); renderStudentStats(student);
      };
      btns.appendChild(doneBtn);
    }
    const delBtn = button("Delete","danger");
    delBtn.onclick=async ()=>{
      const idx = student.tasks.findIndex(t=>t.id===task.id);
      if(idx>=0){ student.tasks.splice(idx,1); await saveStudent(student); renderTaskList(student); }
    };
    btns.appendChild(delBtn);

    row.append(left,btns);
    taskListEl.appendChild(row);
  });
}

/* ---------------- Views ---------------- */
function openStudentsView(){ studentsView.classList.add("active"); studentView.classList.remove("active"); renderStudentsTable(); }
async function openStudentView(id){
  activeStudentId=id;
  const student = students.find(s=>s.id===id);
  if(!student) return;
  studentNameInput.value=student.name;
  studentNameInput.onchange=async ()=>{ student.name=studentNameInput.value.trim()||"Untitled"; await saveStudent(student); renderStudentsTable(); };
  renderStudentStats(student); renderTaskList(student);
  studentsView.classList.remove("active"); studentView.classList.add("active");
}

/* ---------------- Events ---------------- */
addStudentBtn.onclick=async ()=>{
  const s = makeStudent(`Student ${students.length+1}`);
  await saveStudent(s);
  students.push(s);
  renderStudentsTable();
};

backBtn.onclick=()=>{ openStudentsView(); };

addTaskBtn.onclick=async ()=>{
  const student = students.find(s=>s.id===activeStudentId);
  if(!student) return;
  const name = (taskNameInput.value||"").trim();
  const xp = Number(taskXPInput.value||0);
  if(!name||xp<=0) return;
  student.tasks.unshift({ id: cryptoRandomId(), name, xp, status:"In Progress", createdAt:Date.now() });
  taskNameInput.value=""; taskXPInput.value="";
  await saveStudent(student); renderTaskList(student); renderStudentStats(student);
};

/* ---------------- Chat Functions ---------------- */
sendChatBtn.onclick=async ()=>{
  const msg = chatInput.value.trim();
  if(!msg) return;
  await db.collection("chat").add({ text: msg, timestamp: Date.now() });
  chatInput.value="";
};
function renderChat(docs){
  chatBox.innerHTML="";
  docs.forEach(doc=>{
    const data = doc.data();
    const div = el("div", text(data.text));
    div.className="chat-msg";
    chatBox.appendChild(div);
  });
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* ---------------- Init ---------------- */
async function init(){
  students = await loadStudents();
  hideLoading();

  renderStudentsTable();

  // Realtime students
  db.collection("students").onSnapshot(snapshot=>{
    students = snapshot.docs.map(d=>d.data());
    if(!activeStudentId) renderStudentsTable();
    else{
      const student = students.find(s=>s.id===activeStudentId);
      if(student){ renderStudentStats(student); renderTaskList(student); }
    }
  });

  // Realtime chat
  db.collection("chat").orderBy("timestamp").onSnapshot(renderChat);
}
init();
