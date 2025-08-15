const routes = ["home","mock","exams","history"];
const state = {
	companies: [],
	questionsByCompany: {},
	history: JSON.parse(localStorage.getItem("iph_history")||"[]"),
	exam: {timerId:null, seconds:0, active:false, answers:{}, items:[], company:null}
};

function navigate(route){
	routes.forEach(r=>{
		document.getElementById(r).classList.toggle("route-active", r===route);
	});
	if(route==="history"){renderHistory();}
	if(route==="home"){renderCompanyGrid();}
}

function fmtTime(sec){
	const m = Math.floor(sec/60).toString().padStart(2,"0");
	const s = (sec%60).toString().padStart(2,"0");
	return `${m}:${s}`;
}

async function loadData(){
	const res = await fetch("data/companies.json");
	const data = await res.json();
	state.companies = data.companies;
	state.questionsByCompany = data.questionsByCompany;
	populateSelects();
	renderCompanyGrid();
}

function populateSelects(){
	const selects = ["companySelect","mockCompanySelect","examCompanySelect"]
		.map(id=>document.getElementById(id)).filter(Boolean);
	selects.forEach(sel=>{
		sel.innerHTML = state.companies.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
	});
}

function renderCompanyGrid(){
	const grid = document.getElementById("companyGrid");
	if(!grid) return;
	grid.innerHTML = state.companies.map(c=>{
		return `<article class="card">
			<h3>${c.name}</h3>
			<div>
				<span class="tag">${c.domain}</span>
				<span class="tag">${c.level}</span>
			</div>
			<p>${c.summary}</p>
			<div>
				<button class="btn" data-view-company="${c.id}">View</button>
				<button class="btn" data-start-mock="${c.id}">Mock</button>
				<button class="btn btn-primary" data-start-exam="${c.id}">Exam</button>
			</div>
		</article>`;
	}).join("");
}

function openModal(title, html){
	document.getElementById("modalTitle").textContent = title;
	document.getElementById("modalBody").innerHTML = html;
	document.getElementById("modal").classList.remove("hidden");
}
function closeModal(){
	document.getElementById("modal").classList.add("hidden");
}

function renderHistory(){
	const el = document.getElementById("historyContainer");
	if(!el) return;
	if(state.history.length===0){ el.innerHTML = "No attempts yet."; return; }
	el.innerHTML = state.history.map(h=>{
		return `<div class="q-item">
			<div><strong>${h.type}</strong> • ${h.companyName} • <span class="score">${h.score}/${h.total}</span></div>
			<div class="separator"></div>
			<div>${new Date(h.date).toLocaleString()} • Time: ${fmtTime(h.seconds||0)}</div>
		</div>`;
	}).join("");
}

function startMock(companyId){
	const company = state.companies.find(c=>c.id===companyId);
	const qa = state.questionsByCompany[companyId]?.interview||[];
	const container = document.getElementById("mockContainer");
	if(!company || qa.length===0){ container.innerHTML = "No mock questions yet."; return; }
	container.innerHTML = qa.map((q,i)=>{
		return `<div class="q-item">
			<div><strong>Q${i+1}.</strong> ${q.question}</div>
			<div style="margin-top:8px">
				<details>
					<summary>Suggested points</summary>
					<div>${q.points.map(p=>`<div>• ${p}</div>`).join("")}</div>
				</details>
			</div>
		</div>`;
	}).join("");
	navigate("mock");
}

function startExam(companyId){
	const company = state.companies.find(c=>c.id===companyId);
	const items = (state.questionsByCompany[companyId]?.mcq||[]).map((q,idx)=>({
		id: idx+1, question: q.question, choices: q.choices, answer: q.answer
	}));
	state.exam = {timerId:null, seconds:0, active:true, answers:{}, items, company: companyId};
	const controls = document.getElementById("examControls");
	const progress = document.getElementById("examProgress");
	const timer = document.getElementById("examTimer");
	controls.classList.remove("hidden");
	progress.textContent = `0/${items.length}`;
	timer.textContent = fmtTime(0);
	const container = document.getElementById("examContainer");
	container.innerHTML = items.map(item=>{
		return `<div class="q-item" data-qid="${item.id}">
			<div><strong>Q${item.id}.</strong> ${item.question}</div>
			<div class="q-choices">
				${item.choices.map((c,i)=>{
					const id = `q${item.id}_opt${i}`;
					return `<label class="choice" for="${id}"><input type="radio" name="q${item.id}" id="${id}" value="${i}"> ${c}</label>`;
				}).join("")}
			</div>
		</div>`;
	}).join("");
	navigate("exams");
	if(state.exam.timerId){ clearInterval(state.exam.timerId); }
	state.exam.timerId = setInterval(()=>{
		state.exam.seconds+=1; timer.textContent = fmtTime(state.exam.seconds);
	},1000);
}

function submitExam(){
	const {items, answers, seconds, company} = state.exam;
	let correct = 0;
	items.forEach(item=>{ if(Number(answers[item.id])===item.answer){ correct++; } });
	const companyName = state.companies.find(c=>c.id===company)?.name||"Company";
	const score = `${correct}/${items.length}`;
	openModal("Exam Result", `<div class="score">Score: ${score}</div><div>Time: ${fmtTime(seconds)}</div>`);
	if(state.exam.timerId){ clearInterval(state.exam.timerId); }
	state.exam.active=false;
	state.history.unshift({type:"Exam", company, companyName, score:correct, total:items.length, seconds, date:Date.now()});
	localStorage.setItem("iph_history", JSON.stringify(state.history.slice(0,50)));
	renderHistory();
}

function attachEvents(){
	document.querySelectorAll('.nav-link').forEach(a=>{
		a.addEventListener('click', e=>{
			e.preventDefault();
			navigate(a.dataset.route);
		});
	});
	document.getElementById('viewCompany').addEventListener('click', ()=>{
		const id = document.getElementById('companySelect').value; startMock(id);
	});
	document.getElementById('startMock').addEventListener('click', ()=>{
		const id = document.getElementById('mockCompanySelect').value; startMock(id);
	});
	document.getElementById('startExam').addEventListener('click', ()=>{
		const id = document.getElementById('examCompanySelect').value; startExam(id);
	});
	document.getElementById('submitExam').addEventListener('click', submitExam);
	document.getElementById('modalClose').addEventListener('click', closeModal);
	document.getElementById('examContainer').addEventListener('change', e=>{
		if(!state.exam.active) return;
		const target = e.target;
		if(target && target.name && target.name.startsWith('q')){
			const qid = Number(target.name.replace('q',''));
			state.exam.answers[qid] = Number(target.value);
			const answered = Object.keys(state.exam.answers).length;
			document.getElementById('examProgress').textContent = `${answered}/${state.exam.items.length}`;
		}
	});
	document.getElementById('companyGrid').addEventListener('click', e=>{
		const btn = e.target.closest('button'); if(!btn) return;
		if(btn.dataset.viewCompany){ startMock(btn.dataset.viewCompany); }
		if(btn.dataset.startMock){ startMock(btn.dataset.startMock); }
		if(btn.dataset.startExam){ startExam(btn.dataset.startExam); }
	});
}

window.addEventListener('DOMContentLoaded', ()=>{
	attachEvents();
	loadData();
});