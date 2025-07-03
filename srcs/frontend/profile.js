/* global localStorage, fetch */

export async function openProfile(userId) {
  const tpl = document.getElementById("profile-tpl");
  const overlay = tpl.content.cloneNode(true).firstElementChild;
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector(".close-btn");
  closeBtn.onclick = () => overlay.remove();

  const token = localStorage.getItem("token");
  const res   = await fetch(`/user/${userId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data  = await res.json();
  if (!res.ok) { alert(data.error || "Cannot load profile"); return; }

  renderView(overlay, data);
  wireExtraButtons(overlay, data);
  wireFriendBlock(overlay, data);

  const isMe = +userId === window.__CURRENT_USER_ID;
  if (isMe) {
    wireEdit(overlay, data);
    wireTwoFactor(overlay, data);
  }
}

function renderView(ov, d) {
  const aliasVal = d.alias?.trim() || d.username;

  ov.querySelector("#pr-username").textContent = "@" + aliasVal;
  ov.querySelector("#pr-alias").textContent = aliasVal;

  const fullVal = d.full_name?.trim() || aliasVal;
  ov.querySelector("#pr-full").textContent = fullVal;
  ov.querySelector("#pr-email")  .textContent = d.email        || "";
  ov.querySelector("#pr-created").textContent = d.created_at  || "";
  ov.querySelector("#pr-online") .textContent = d.online       ? "Yes" : "No";

  const img = ov.querySelector("#pr-avatar");
  const url = d.avatar
    ? `/uploads/${d.avatar}?_=${Date.now()}`
    : "/assets/default-avatar.png";
  img.src = url;

  ov.querySelectorAll(".private").forEach(el => {
    if (!el.textContent.trim()) el.classList.add("hidden");
  });
}


function wireEdit(ov, data) {
  const edit   = ov.querySelector("#pr-edit");
  const save   = ov.querySelector("#pr-save");
  const cancel = ov.querySelector("#pr-cancel");

  // Hide save/cancel buttons initially
  edit.classList.remove("hidden");
  edit.classList.add("inline-block");
  save.classList.add("hidden");
  cancel.classList.add("hidden");

  edit.onclick = () => {
    //toggle visibility of buttons
    edit.classList.add("hidden");
    save.classList.remove("hidden");
    cancel.classList.remove("hidden");

    //hide profile info, show inputs
    ["alias","full"].forEach(k => {
      const span = ov.querySelector(`#pr-${k}`);
      const val  = span.textContent;
      span.innerHTML = `<input id="pr-${k}-in" value="${val}" class="w-full text-blue-950"/>`;
    });
    ov.querySelector("#pr-email")?.classList.add("opacity-50");
    ov.querySelector("#pr-avatar")
      .insertAdjacentHTML("afterend",
        `<input id="pr-avatar-in" type="file" accept="image/*" class="block my-2 text-blue-950" />`
      );
  };

  cancel.onclick = () => {
    ov.remove(); 
    openProfile(data.id); // reload fresh view
  };

  save.onclick = async () => {
    const body = {
      alias:     ov.querySelector("#pr-alias-in") .value.trim(),
      full_name: ov.querySelector("#pr-full-in")  .value.trim()
    };
    const token = localStorage.getItem("token");
    const up   = await fetch("/profile", {
      method:"PUT",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
      body: JSON.stringify(body)
    });
    if (!up.ok) { alert("Save failed"); return; }

    // avatar?
    const imgInput = ov.querySelector("#pr-avatar-in");
    if (imgInput?.files.length) {
      const fd = new FormData(); fd.append("file", imgInput.files[0]);
      await fetch(`/avatar`, { method:"POST",
        headers:{ Authorization:`Bearer ${token}` }, body: fd });
    }
    ov.remove(); openProfile(data.id);                  // reload fresh view
  };
}

function wireTwoFactor(ov, data) {
  const row = ov.querySelector("#pr-2fa-row");
  const box = ov.querySelector("#pr-2fa");
  row.classList.remove("hidden");
  box.checked = !!data.two_factor_auth;
  box.onchange = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("/twofactor", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled: box.checked })
    });
    if (!res.ok) {
      alert("Failed to update setting");
      box.checked = !box.checked;
    }
  };
}

   /* ----------  Friends / Match history  ---------- */
function wireExtraButtons(ov, data) {
const friendsBtn = ov.querySelector("#pr-friends");
const histBtn    = ov.querySelector("#pr-history");
const extraBox   = ov.querySelector("#pr-extra");
const token      = localStorage.getItem("token");

friendsBtn.onclick = async () => {
  extraBox.innerHTML = "<p>Loading…</p>";
  let rows = [];
  try {
    const r = await fetch(`/friends/${data.id}`, {
      headers:{ Authorization:`Bearer ${token}` }
    });
    rows = await r.json();
  } catch { /* ignore */ }

  if (!Array.isArray(rows) || !rows.length) {
    extraBox.textContent = "No friends to show.";
    return;
  }

  const ul = document.createElement("ul");
  rows.forEach(u => {
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="view-profile cursor-pointer text-[color:var(--link,#06c)] hover:underline" data-userid="${u.id}">${u.username}</span>`;
    ul.appendChild(li);
  });
  extraBox.innerHTML = ""; extraBox.appendChild(ul);
};

histBtn.onclick = async () => {
  extraBox.innerHTML = "<p>Loading…</p>";
  let games = [];
  try {
    const r = await fetch(`/history/${data.id}`, {
      headers:{ Authorization:`Bearer ${token}` }
    });
    games = await r.json();
  } catch { /* ignore */ }

  if (!Array.isArray(games) || !games.length) {
    extraBox.textContent = "No matches yet.";
    return;
  }

  const tbl = document.createElement("table");
  tbl.className = "w-full";
  tbl.innerHTML =
    "<thead><tr><th>Date</th><th>Result</th><th>Score</th></tr></thead>";
  const tb = document.createElement("tbody");
  games.forEach(g => {
    const row = document.createElement("tr");
    const youWon = +g.winnerId === +data.id;
    row.innerHTML =
      `<td>${g.timestamp.slice(0,10)}</td>
       <td>${youWon ? "Win" : "Loss"}</td>
       <td>${g.scoreWinner} – ${g.scoreLoser}</td>`;
    tb.appendChild(row);
  });
  tbl.appendChild(tb);
  extraBox.innerHTML = ""; extraBox.appendChild(tbl);
};
}

/* ─── Add / Remove Friend  &  Block / Unblock ─── */
function wireFriendBlock(ov, data) {
const friendBtn = ov.querySelector("#pr-friend-action");
const blockBtn  = ov.querySelector("#pr-block-action");
const token     = localStorage.getItem("token");

// If it's my own profile, hide both buttons
if (+data.id === window.__CURRENT_USER_ID) {
  friendBtn.classList.add("hidden");
  blockBtn.classList.add("hidden");
  return;
}

// Immediately fetch my current friends & blocked lists
(async () => {
  const r = await fetch("/currentuser", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const me = await r.json();
  const friends = me.friends ? JSON.parse(me.friends).map(Number) : [];
  const blocked = me.blocked_users ? JSON.parse(me.blocked_users).map(Number) : [];

  // Helpers to set button text
  function updateFriendLabel() {
    friendBtn.textContent = friends.includes(data.id)
      ? "Remove Friend"
      : "Add Friend";
  }
  function updateBlockLabel() {
    blockBtn.textContent = blocked.includes(data.id)
      ? "Unblock User"
      : "Block User";
  }

  updateFriendLabel();
  updateBlockLabel();

  // Add / Remove Friend
  friendBtn.onclick = async () => {
    const isFriend = friends.includes(data.id);
    const method   = isFriend ? "DELETE" : "POST";
    const res = await fetch("/friend", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ friendId: data.id })
    });
    if (!res.ok) return;
    if (isFriend) {
      friends.splice(friends.indexOf(data.id), 1);
    } else {
      friends.push(data.id);
    }
    updateFriendLabel();
  };

  // Block / Unblock User
  blockBtn.onclick = async () => {
    const isBlocked = blocked.includes(data.id);
    const method    = isBlocked ? "DELETE" : "POST";
    const res = await fetch("/block", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ userId: data.id })
    });
    if (!res.ok) return;
    if (isBlocked) {
      blocked.splice(blocked.indexOf(data.id), 1);
    } else {
      blocked.push(data.id);
    }
    updateBlockLabel();
  };
})();
}
