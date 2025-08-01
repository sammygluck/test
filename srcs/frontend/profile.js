let __CURRENT_USER_ID = null;
window.__CURRENT_USER_ID = null;
let _navProfileInitDone = false;
export function getAvatarUrl(avatar) {
    if (!avatar)
        return null;
    return avatar.startsWith("http") ? avatar : `/uploads/${avatar}`;
}
export async function openProfile(userId) {
    const tpl = document.getElementById("profile-tpl");
    if (!tpl)
        throw new Error("#profile-tpl template element not found");
    const frag = tpl.content.cloneNode(true);
    const overlay = frag.firstElementChild;
    document.body.appendChild(overlay);
    overlay.querySelector(".close-btn")?.addEventListener("click", () => overlay.remove());
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Missing auth token – please login again");
        overlay.remove();
        return;
    }
    let data;
    try {
        const res = await fetch(`/user/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        data = (await res.json());
        if (!res.ok)
            throw new Error(data.error ?? "Cannot load profile");
    }
    catch (err) {
        alert(err instanceof Error ? err.message : String(err));
        overlay.remove();
        return;
    }
    if (userId === window.__CURRENT_USER_ID) {
        const buf = localStorage.getItem("userInfo");
        if (buf) {
            try {
                const ui = JSON.parse(buf);
                ui.alias = data.alias ?? null;
                ui.username = data.username;
                ui.avatar = data.avatar ?? null;
                localStorage.setItem("userInfo", JSON.stringify(ui));
            }
            catch {
            }
        }
    }
    renderView(overlay, data);
    wireExtraButtons(overlay, data);
    wireFriendBlock(overlay, data);
    if (userId === window.__CURRENT_USER_ID) {
        const navAvatar = document.getElementById("navAvatar");
        if (navAvatar)
            navAvatar.src = data.avatar
                ? `${getAvatarUrl(data.avatar)}?_=${Date.now()}`
                : "/assets/default-avatar.png";
        const nameEl = document.getElementById("navUsername");
        if (nameEl) {
            const aliasVal = (data.alias ?? "").trim() || data.username;
            nameEl.textContent = aliasVal;
        }
        const tf = wireTwoFactor(overlay, data);
        wireEdit(overlay, data, tf);
    }
}
function renderView(ov, d) {
    const aliasVal = (d.alias ?? "").trim() || d.username;
    ov.querySelector("#pr-username").textContent = `@${aliasVal}`;
    ov.querySelector("#pr-alias").textContent = aliasVal;
    const fullVal = (d.full_name ?? "").trim() || aliasVal;
    ov.querySelector("#pr-full").textContent = fullVal;
    ov.querySelector("#pr-email").textContent = d.email ?? "";
    ov.querySelector("#pr-created").textContent = d.created_at ?? "";
    const onlineDot = ov.querySelector("#pr-online");
    onlineDot.classList.remove("bg-red-500", "bg-green-500");
    onlineDot.classList.add(d.online ? "bg-green-500" : "bg-red-500");
    const img = ov.querySelector("#pr-avatar");
    img.src = d.avatar ? `/uploads/${d.avatar}?_=${Date.now()}` : "/assets/default-avatar.png";
    ov.querySelectorAll(".private").forEach(el => {
        if (!el.textContent?.trim())
            el.classList.add("hidden");
    });
}
function wireEdit(ov, data, tfHooks) {
    const edit = ov.querySelector("#pr-edit");
    const save = ov.querySelector("#pr-save");
    const cancel = ov.querySelector("#pr-cancel");
    edit.classList.remove("hidden");
    edit.classList.add("inline-block");
    save.classList.add("hidden");
    cancel.classList.add("hidden");
    edit.onclick = () => {
        edit.classList.add("hidden");
        save.classList.remove("hidden");
        cancel.classList.remove("hidden");
        tfHooks?.enable();
        ["alias", "full"].forEach(k => {
            const span = ov.querySelector(`#pr-${k}`);
            const val = span.textContent ?? "";
            span.innerHTML = `<input id="pr-${k}-in" value="${val}" class="w-full text-blue-950" />`;
        });
        ["#pr-email", "#pr-created", "#pr-online"].forEach(sel => {
            ov.querySelector(sel)?.classList.add("opacity-50");
        });
        ov.querySelector("#pr-avatar")?.insertAdjacentHTML("afterend", `<input id="pr-avatar-in" type="file" accept="image/*" class="block my-2 text-blue-950" />`);
    };
    cancel.onclick = () => {
        tfHooks?.disable();
        ov.remove();
        void openProfile(data.id);
    };
    save.onclick = async () => {
        const body = {
            alias: (ov.querySelector("#pr-alias-in")?.value ?? "").trim(),
            full_name: (ov.querySelector("#pr-full-in")?.value ?? "").trim()
        };
        const token = localStorage.getItem("token");
        if (!token) {
            alert("Auth expired");
            return;
        }
        const up = await fetch("/profile", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        if (!up.ok) {
            alert("Save failed");
            return;
        }
        const imgInput = ov.querySelector("#pr-avatar-in");
        if (imgInput?.files?.length) {
            const fd = new FormData();
            fd.append("file", imgInput.files[0]);
            await fetch("/avatar", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: fd
            });
        }
        const buf = localStorage.getItem("userInfo");
        if (buf) {
            try {
                const ui = JSON.parse(buf);
                ui.alias = body.alias || null;
                localStorage.setItem("userInfo", JSON.stringify(ui));
            }
            catch {
            }
        }
        ov.remove();
        void openProfile(data.id);
    };
}
function wireTwoFactor(ov, data) {
    const row = ov.querySelector("#pr-2fa-row");
    const box = ov.querySelector("#pr-2fa");
    row.classList.remove("hidden");
    box.checked = !!data.two_factor_auth;
    const handler = async () => {
        const token = localStorage.getItem("token");
        if (!token)
            return;
        const res = await fetch("/twofactor", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ enabled: box.checked })
        });
        if (!res.ok) {
            alert("Failed to update setting");
            box.checked = !box.checked;
        }
    };
    const enable = () => {
        box.disabled = false;
        box.addEventListener("change", handler);
    };
    const disable = () => {
        box.disabled = true;
        box.removeEventListener("change", handler);
    };
    disable();
    return { enable, disable };
}
function wireExtraButtons(ov, data) {
    const friendsBtn = ov.querySelector("#pr-friends");
    const histBtn = ov.querySelector("#pr-history");
    const extraBox = ov.querySelector("#pr-extra");
    const token = localStorage.getItem("token");
    let currentView = null;
    friendsBtn.onclick = async () => {
        if (currentView === "friends") {
            extraBox.replaceChildren();
            currentView = null;
            return;
        }
        currentView = "friends";
        extraBox.innerHTML = "<p>Loading…</p>";
        let rows = [];
        try {
            const r = await fetch(`/friends/${data.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            rows = (await r.json());
        }
        catch {
        }
        if (!Array.isArray(rows) || !rows.length) {
            extraBox.textContent = "No friends to show.";
            return;
        }
        const ul = document.createElement("ul");
        rows.forEach(u => {
            const li = document.createElement("li");
            li.innerHTML = `<span class="view-profile cursor-pointer text-[color:var(--link,#06c)] hover:underline hover:opacity-80" data-userid="${u.id}">${u.username}</span>`;
            ul.appendChild(li);
        });
        extraBox.replaceChildren(ul);
    };
    histBtn.onclick = async () => {
        if (currentView === "history") {
            extraBox.replaceChildren();
            currentView = null;
            return;
        }
        currentView = "history";
        extraBox.innerHTML = "<p>Loading…</p>";
        let games = [];
        try {
            const r = await fetch(`/matchhistory/${data.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            games = (await r.json());
        }
        catch {
        }
        if (!Array.isArray(games) || !games.length) {
            extraBox.textContent = "No matches yet.";
            return;
        }
        const tbl = document.createElement("table");
        tbl.className = "w-full table-auto";
        const includeTournament = games.length && ("tournament_name" in games[0] || "tournamentId" in games[0]);
        tbl.innerHTML =
            `<thead class="text-left"><tr>` +
                `<th class="px-2">Date</th>` +
                `<th class="px-2">Opponent</th>` +
                `<th class="px-2">Result</th>` +
                `<th class="px-2">Score</th>` +
                (includeTournament ? `<th class="px-2">Tournament</th>` : "") +
                `</tr></thead>`;
        const tb = document.createElement("tbody");
        games.forEach(g => {
            const row = document.createElement("tr");
            const youWon = g.winnerId === data.id;
            const opponentName = youWon ? g.loser_username : g.winner_username;
            const opponentId = youWon ? g.loserId : g.winnerId;
            let tournament = "";
            if (includeTournament)
                tournament = g.tournament_name ?? String(g.tournamentId ?? "");
            const resultClass = youWon ? "text-green-500" : "text-red-500";
            row.innerHTML =
                `<td class="px-2">${g.timestamp.slice(0, 10)}</td>` +
                    `<td class="px-2"><span class="view-profile cursor-pointer text-[color:var(--link,#06c)] hover:underline hover:opacity-80" data-userid="${opponentId}">${opponentName ?? ""}</span></td>` +
                    `<td class="px-2 ${resultClass}">${youWon ? "Win" : "Loss"}</td>` +
                    `<td class="px-2">${g.scoreWinner} – ${g.scoreLoser}</td>` +
                    (includeTournament ? `<td class="px-2">${tournament}</td>` : "");
            tb.appendChild(row);
        });
        tbl.appendChild(tb);
        extraBox.replaceChildren(tbl);
    };
}
function wireFriendBlock(ov, data) {
    const friendBtn = ov.querySelector("#pr-friend-action");
    const blockBtn = ov.querySelector("#pr-block-action");
    const token = localStorage.getItem("token");
    friendBtn.classList.add("hidden");
    blockBtn.classList.add("hidden");
    if (data.id === window.__CURRENT_USER_ID)
        return;
    (async () => {
        const r = await fetch("/currentuser", { headers: { Authorization: `Bearer ${token}` } });
        const me = (await r.json());
        const friends = me.friends ? JSON.parse(me.friends).map(Number) : [];
        const blocked = me.blocked_users ? JSON.parse(me.blocked_users).map(Number) : [];
        const updateFriendLabel = () => {
            friendBtn.textContent = friends.includes(data.id) ? "Remove Friend" : "Add Friend";
        };
        const updateBlockLabel = () => {
            blockBtn.textContent = blocked.includes(data.id) ? "Unblock User" : "Block User";
        };
        updateFriendLabel();
        updateBlockLabel();
        friendBtn.classList.remove("hidden");
        blockBtn.classList.remove("hidden");
        friendBtn.onclick = async () => {
            const isFriend = friends.includes(data.id);
            const method = isFriend ? "DELETE" : "POST";
            const res = await fetch("/friend", {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ friendId: data.id })
            });
            if (!res.ok)
                return;
            if (isFriend) {
                friends.splice(friends.indexOf(data.id), 1);
            }
            else {
                friends.push(data.id);
            }
            updateFriendLabel();
        };
        blockBtn.onclick = async () => {
            const isBlocked = blocked.includes(data.id);
            const method = isBlocked ? "DELETE" : "POST";
            const res = await fetch("/block", {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ userId: data.id })
            });
            if (!res.ok)
                return;
            if (isBlocked) {
                blocked.splice(blocked.indexOf(data.id), 1);
            }
            else {
                blocked.push(data.id);
            }
            updateBlockLabel();
        };
    })();
}
export function initNavProfile() {
    let userInfoGlobal;
    const buf = localStorage.getItem("userInfo");
    if (!buf) {
        document.getElementById("chat-block")?.classList.add("hidden");
        if (window.location.pathname !== "/login") {
            window.location.href = "/login";
        }
        return;
    }
    userInfoGlobal = JSON.parse(buf);
    const avatarEl = document.getElementById("navAvatar");
    if (avatarEl) {
        avatarEl.dataset.userid = String(userInfoGlobal.id);
        avatarEl.classList.add("view-profile", "cursor-pointer", "hover:underline", "hover:opacity-80");
    }
    (async () => {
        const userInfo = userInfoGlobal;
        localStorage.setItem("token", userInfo.token);
        const me = await fetch("/currentuser", {
            headers: { Authorization: `Bearer ${userInfo.token}` }
        }).then(r => r.json()).catch(() => null);
        if (!me) {
            window.location.href = "/login";
            return;
        }
        __CURRENT_USER_ID = window.__CURRENT_USER_ID = me.id;
        const avatar = document.getElementById("navAvatar");
        if (avatar) {
            avatar.dataset.userid = String(me.id);
            avatar.src = me.avatar ? `${getAvatarUrl(me.avatar)}?_=${Date.now()}` : "/assets/default-avatar.png";
        }
        const nameEl = document.getElementById("navUsername");
        if (nameEl) {
            const aliasVal = (me.alias ?? "").trim() || me.username;
            nameEl.textContent = aliasVal;
            nameEl.dataset.userid = String(me.id);
            nameEl.classList.add("view-profile", "cursor-pointer", "hover:underline", "hover:opacity-80");
        }
    })();
    if (!_navProfileInitDone) {
        document.body.addEventListener("click", e => {
            const t = e.target.closest(".view-profile");
            if (!t)
                return;
            const raw = t.dataset.userid;
            const userId = parseInt(raw ?? "", 10);
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
        _navProfileInitDone = true;
    }
    const nameEl = document.getElementById("navUsername");
    if (nameEl) {
        const aliasVal = (userInfoGlobal.alias ?? "").trim() || userInfoGlobal.username;
        nameEl.textContent = aliasVal;
        nameEl.dataset.userid = String(userInfoGlobal.id);
        nameEl.classList.add("view-profile", "cursor-pointer", "hover:underline", "hover:opacity-80");
    }
}
initNavProfile();
