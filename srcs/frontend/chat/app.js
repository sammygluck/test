import { openProfile } from "../profile.js";


(function() {
let ws;
let userInfoGlobal;

const buf = localStorage.getItem("userInfo");
if (!buf) {
  document.getElementById("chat-block")?.classList.add("hidden");
//   window.location.href = "/login";
//   throw new Error("redirecting to /login");
  // keep any stray chat panel hidden
  if (window.location.pathname !== "/login") {
	window.location.href = "/login";
  }
  return; // nothing below should run
}
userInfoGlobal = JSON.parse(buf);

let __CURRENT_USER_ID = null;
window.__CURRENT_USER_ID = null;
(async () => {
   /* Pull token from the userInfo blob and expose it */
   const userInfo = userInfoGlobal;
   localStorage.setItem("token", userInfo.token);          // <-- make profile.js happy

   const me = await fetch("/currentuser", {
     headers: { Authorization:`Bearer ${userInfo.token}` } // use the fresh token
   }).then(r=>r.json()).catch(()=>null);
   if (!me) { window.location.href = "/login"; return; }
   __CURRENT_USER_ID = window.__CURRENT_USER_ID = me.id;
   document.getElementById('navAvatar').dataset.userid = me.id;   // NEW
   const nameEl = document.getElementById('navUsername');
	nameEl.dataset.userid = me.id;                // same id as avatar
	nameEl.classList.add('view-profile', 'cursor-pointer');
})();

document.body.addEventListener("click", e => {
	const t = e.target.closest(".view-profile");
	if (!t) return;

	// parse & validate
	const raw = t.dataset.userid;
	const userId = parseInt(raw, 10);
	if (Number.isNaN(userId)) {
	console.warn("view-profile clicked but data-userid is invalid:", raw);
		return;
	}
	
		openProfile(userId);
	});

document.getElementById("view-my-profile")?.addEventListener("click", () => {
	if (window.__CURRENT_USER_ID)
		openProfile(window.__CURRENT_USER_ID);
});

const messages = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const userIdDestination = document.getElementById("userIdDestination");


//this and next new
// make the navbar username behave like the avatar
const nameEl = document.getElementById("navUsername");
if (nameEl) {
  nameEl.dataset.userid = userInfoGlobal.id;
  nameEl.classList.add("view-profile", "cursor-pointer");
}

  })();
