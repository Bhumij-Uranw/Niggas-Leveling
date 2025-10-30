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
    if(level<=1) req=100;
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
const streakBadge      = document.getElementById("streakBadge");

const taskNameInput = document.getElementById("taskName");
const taskXPInput   = document.getElementById("taskXP");
const addTaskBtn    = document.getElementById("addTaskBtn");
const taskListEl    = document.getElementById("taskList");

const checkinBtn    = document.getElementById("checkinBtn");

/* ---------------- CHAT DOM ---------------- */
const chatBox      = document.getElementById("chatBox");
const chatInput    = document.getElementById("chatInput");
const sendChatBtn  = document.getElementById("sendChatBtn");

/* ---------------- Firestore ---------------- */
const db = firebase.firestore();

/* daily bonus XP for checking in once per day */
const DAILY_BONUS_XP = 10;

/* ---------------- Firebase Functions ---------------- */
async function loadStudents(){
  const snapshot = await db.collection("students").get();
  let studentsArr = snapshot.docs.map(doc=>doc.data());
  if(studentsArr.length === 0){
    const defaults = [
      makeStudent("Player 1"),
      makeStudent("Player 2"),
      makeStudent("Player 3"),
      makeStudent("Player 4")
    ];
    for(const s of defaults) await db.collection("students").doc(s.id).set(s);
    studentsArr = defaults;
  }
  return studentsArr;
}

function makeStudent(name){
  return {
    id: cryptoRandomId(),
    name,
    totalXP:0,
    tasks:[],
    streak:0,
    lastCheckin:0 // timestamp
  };
}
async function saveStudent(student){ await db.collection("students").doc(student.id).set(student); }
async function deleteStudent(student){ await db.collection("students").doc(student.id).delete(); }

/* ---------------- Date helpers ---------------- */
function isSameDay(tsA, tsB){
  if(!tsA || !tsB) return false;
  const a = new Date(tsA);
  const b = new Date(tsB);
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}
function yesterdayTimestamp(ts){
  const d = new Date(ts);
  d.setDate(d.getDate() - 1);
  return d.getTime();
}

/* ---------------- Render ---------------- */
function renderStudentsTable(){
  studentsTbody.innerHTML="";

  // Sort students by totalXP desc (ranking)
  const ranked = [...students].sort((a,b)=> b.totalXP - a.totalXP || (b.name.localeCompare(a.name)));

  ranked.forEach((s, idx)=>{
    const { level, currentXP, xpNeeded } = calcLevel(s.totalXP);
    const tr = document.createElement("tr");

    const noTd = el("td", text(idx+1 + (idx===0 ? " 👑" : "")));
    const nameTd = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.className="name-inline";
    nameInput.value = s.name;
    nameInput.onchange=async ()=>{
      s.name=nameInput.value.trim()||"Untitled";
      await saveStudent(s);
      await refreshAll(); // re-render leaderboard in case of tie/name
    };
    nameTd.appendChild(nameInput);

    const levelTd = el("td", text(`Lv ${level}`));
    const xpTd    = el("td", text(`${currentXP}`));
    const needTd  = el("td", text(`${xpNeeded}`));
    const streakTd = el("td", text(s.streak || 0));

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

    tr.append(noTd, nameTd, levelTd, xpTd, needTd, streakTd, openTd, deleteTd);
    studentsTbody.appendChild(tr);
  });
}

function renderStudentStats(student){
  const { level, currentXP, xpNeeded } = calcLevel(student.totalXP);
  levelBadge.textContent=`Lv ${level}`;
  xpNow.textContent=`${currentXP} XP`;
  xpNext.textContent=`/ ${xpNeeded} to next`;
  xpBarFill.style.width=`${Math.min(100,(currentXP/xpNeeded*100))}%`;
  streakBadge.textContent = `Streak: ${student.streak || 0}`;
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
        // Mark done and apply xp
        // Only apply daily bonus once per day (if not already checked today)
        const now = Date.now();
        const didCheckToday = isSameDay(student.lastCheckin, now);
        if(!didCheckToday){
          // increment streak or reset if lastCheckin was more than 1 day ago
          if(isSameDay(student.lastCheckin, yesterdayTimestamp(now))){
            student.streak = (student.streak || 0) + 1;
          } else {
            // if lastCheckin not yesterday and not today, reset streak to 1
            student.streak = 1;
          }
          student.lastCheckin = now;
          student.totalXP += Number(DAILY_BONUS_XP || 0);
        }
        // give task xp
        task.status="Done";
        student.totalXP += Number(task.xp);
        await saveStudent(student);
        renderTaskList(student);
        renderStudentStats(student);
        await refreshAll();
      };
      btns.appendChild(doneBtn);
    }
    const delBtn = button("Delete","danger");
    delBtn.onclick=async ()=>{
      const idx = student.tasks.findIndex(t=>t.id===task.id);
      if(idx>=0){ student.tasks.splice(idx,1); await saveStudent(student); renderTaskList(student); await refreshAll(); }
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
  const s = makeStudent(`Player ${students.length+1}`);
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
  await saveStudent(student); renderTaskList(student); renderStudentStats(student); await refreshAll();
};

checkinBtn.onclick=async ()=>{
  const student = students.find(s=>s.id===activeStudentId);
  if(!student) return;
  const now = Date.now();
  const didCheckToday = isSameDay(student.lastCheckin, now);
  if(didCheckToday){
    alert("Already checked in today.");
    return;
  }

  // If lastCheckin was yesterday, increment streak, else reset to 1
  if(isSameDay(student.lastCheckin, yesterdayTimestamp(now))){
    student.streak = (student.streak || 0) + 1;
  } else {
    student.streak = 1;
  }
  student.lastCheckin = now;
  student.totalXP += Number(DAILY_BONUS_XP || 0);
  await saveStudent(student);
  renderStudentStats(student);
  await refreshAll();
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

/* ---------------- Helpers ---------------- */
async function refreshAll(){
  // reload students from local array (already updated) and re-render table
  // If you want to re-query from server, you can, but here we re-render from current students state.
  renderStudentsTable();
}

/* ---------------- Init ---------------- */
async function init(){
  try {
    students = await loadStudents();
  } catch(err){
    console.error("Failed to load students:", err);
    students = [];
  } finally {
    hideLoading();
  }

  renderStudentsTable();

  try {
    // Realtime students updates
    db.collection("students").onSnapshot(snapshot=>{
      students = snapshot.docs.map(d=>d.data());
      if(!activeStudentId) renderStudentsTable();
      else{
        const student = students.find(s=>s.id===activeStudentId);
        if(student){ renderStudentStats(student); renderTaskList(student); }
      }
    });

    // Realtime chat updates
    db.collection("chat").orderBy("timestamp").onSnapshot(renderChat);
  } catch(err){
    console.error("Realtime Firestore failed:", err);
  }
}
init();
