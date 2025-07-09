/** -------------------------------------------------------------------------
 *  Globals & Shared Types
 *  ------------------------------------------------------------------------*/

declare global {
  interface Window {
    /** Set by `initNavProfile()` so other modules can reference the logged‑in user */
    __CURRENT_USER_ID: number | null;
  }
}

let __CURRENT_USER_ID: number | null = null;
window.__CURRENT_USER_ID = null;
let _navProfileInitDone = false;
  
  export interface UserProfileData {
    id: number;
    username: string;
    /** Optional user alias */
    alias?: string | null;
    full_name?: string | null;
    email?: string | null;
    created_at?: string | null;
    online?: boolean | null;
    avatar?: string | null;
    two_factor_auth?: boolean | null;
  }
  
  export interface FriendRow {
    id: number;
    username: string;
  }
  
  export interface GameHistoryRow {
    timestamp: string;        // ISO string
    winnerId: number;
    scoreWinner: number;
    scoreLoser: number;
  }
  
  /** -------------------------------------------------------------------------
   *  Main entry – opens an overlay showing the user profile
   *  ------------------------------------------------------------------------*/
  
  export async function openProfile(userId: number): Promise<void> {
    const tpl = document.getElementById("profile-tpl") as HTMLTemplateElement | null;
    if (!tpl) throw new Error("#profile-tpl template element not found");
  
    // Clone the <template> → real node and append to <body>
    const frag    = tpl.content.cloneNode(true) as DocumentFragment;
    const overlay = frag.firstElementChild as HTMLElement;
    document.body.appendChild(overlay);
  
    // Close‑button support (X icon etc.)
    overlay.querySelector<HTMLButtonElement>(".close-btn")?.addEventListener("click", () => overlay.remove());
  
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Missing auth token – please login again");
      overlay.remove();
      return;
    }
  
    let data: UserProfileData;
    try {
      const res = await fetch(`/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      data = (await res.json()) as UserProfileData;
      if (!res.ok) throw new Error((data as unknown as { error?: string }).error ?? "Cannot load profile");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      overlay.remove();
      return;
    }
  
    renderView(overlay, data);
    wireExtraButtons(overlay, data);
    wireFriendBlock(overlay, data);

    // Editing / 2FA only for own profile
    if (userId === window.__CURRENT_USER_ID) {
      const tf = wireTwoFactor(overlay, data);
      wireEdit(overlay, data, tf);
    }
  }
  
  /** -------------------------------------------------------------------------
   *  VIEW – render basic profile information
   *  ------------------------------------------------------------------------*/
  
  function renderView(ov: HTMLElement, d: UserProfileData): void {
    const aliasVal = (d.alias ?? "").trim() || d.username;
    ov.querySelector<HTMLElement>("#pr-username")!.textContent = `@${aliasVal}`;
    ov.querySelector<HTMLElement>("#pr-alias")!.textContent = aliasVal;
  
    const fullVal = (d.full_name ?? "").trim() || aliasVal;
    ov.querySelector<HTMLElement>("#pr-full")!.textContent = fullVal;
    ov.querySelector<HTMLElement>("#pr-email")!.textContent = d.email ?? "";
    ov.querySelector<HTMLElement>("#pr-created")!.textContent = d.created_at ?? "";
  
    const onlineDot = ov.querySelector<HTMLElement>("#pr-online")!;
    onlineDot.classList.remove("bg-red-500", "bg-green-500");
    onlineDot.classList.add(d.online ? "bg-green-500" : "bg-red-500");
  
    // Avatar – cache‑bust by appending Date.now()
    const img = ov.querySelector<HTMLImageElement>("#pr-avatar")!;
    img.src = d.avatar ? `/uploads/${d.avatar}?_=${Date.now()}` : "/assets/default-avatar.png";
  
    // Hide empty private rows
    ov.querySelectorAll<HTMLElement>(".private").forEach(el => {
      if (!el.textContent?.trim()) el.classList.add("hidden");
    });
  }
  
  /** -------------------------------------------------------------------------
   *  EDIT – alias/full‑name/avatar editing for your own profile
   *  ------------------------------------------------------------------------*/
  
  function wireEdit(
    ov: HTMLElement,
    data: UserProfileData,
    tfHooks?: { enable: () => void; disable: () => void }
  ): void {
    const edit   = ov.querySelector<HTMLButtonElement>("#pr-edit")!;
    const save   = ov.querySelector<HTMLButtonElement>("#pr-save")!;
    const cancel = ov.querySelector<HTMLButtonElement>("#pr-cancel")!;
  
    // Button visibility defaults
    edit.classList.remove("hidden");
    edit.classList.add("inline-block");
    save.classList.add("hidden");
    cancel.classList.add("hidden");
  
    edit.onclick = () => {
      // Toggle visibility of buttons
      edit.classList.add("hidden");
      save.classList.remove("hidden");
      cancel.classList.remove("hidden");

      tfHooks?.enable();
  
      // Replace spans with <input>
      ["alias", "full"].forEach(k => {
        const span = ov.querySelector<HTMLElement>(`#pr-${k}`)!;
        const val  = span.textContent ?? "";
        span.innerHTML = `<input id="pr-${k}-in" value="${val}" class="w-full text-blue-950" />`;
      });
      ["#pr-email", "#pr-created", "#pr-online"].forEach(sel => {
        ov.querySelector<HTMLElement>(sel)?.classList.add("opacity-50");
      });
      ov.querySelector<HTMLElement>("#pr-avatar")?.insertAdjacentHTML(
        "afterend",
        `<input id="pr-avatar-in" type="file" accept="image/*" class="block my-2 text-blue-950" />`
      );
    };
  
    cancel.onclick = () => {
      tfHooks?.disable();
      ov.remove();
      // Reload freshly to discard unsaved edits
      void openProfile(data.id);
    };
  
    save.onclick = async () => {
      const body = {
        alias:     (ov.querySelector<HTMLInputElement>("#pr-alias-in")?.value ?? "").trim(),
        full_name: (ov.querySelector<HTMLInputElement>("#pr-full-in")?.value  ?? "").trim()
      };
  
      const token = localStorage.getItem("token");
      if (!token) { alert("Auth expired"); return; }
  
      const up = await fetch("/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
  
      if (!up.ok) { alert("Save failed"); return; }
  
      // Optional avatar upload
      const imgInput = ov.querySelector<HTMLInputElement>("#pr-avatar-in");
      if (imgInput?.files?.length) {
        const fd = new FormData();
        fd.append("file", imgInput.files[0]);
        await fetch("/avatar", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd
        });
      }
  
      ov.remove();
      void openProfile(data.id); // reload
    };
  }
  
  /** -------------------------------------------------------------------------
   *  TWO‑FACTOR – enable/disable 2FA checkbox (only on own profile)
   *  ------------------------------------------------------------------------*/
  
  function wireTwoFactor(
    ov: HTMLElement,
    data: UserProfileData
  ): { enable: () => void; disable: () => void } {
    const row = ov.querySelector<HTMLElement>("#pr-2fa-row")!;
    const box = ov.querySelector<HTMLInputElement>("#pr-2fa")!;

    row.classList.remove("hidden");
    box.checked = !!data.two_factor_auth;

    const handler = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

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
        box.checked = !box.checked; // revert UI
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
  
  /** -------------------------------------------------------------------------
   *  FRIENDS & MATCH HISTORY buttons
   *  ------------------------------------------------------------------------*/
  
  function wireExtraButtons(ov: HTMLElement, data: UserProfileData): void {
    const friendsBtn = ov.querySelector<HTMLButtonElement>("#pr-friends")!;
    const histBtn    = ov.querySelector<HTMLButtonElement>("#pr-history")!;
    const extraBox   = ov.querySelector<HTMLElement>("#pr-extra")!;
    const token      = localStorage.getItem("token");
  
    friendsBtn.onclick = async () => {
      extraBox.innerHTML = "<p>Loading…</p>";
      let rows: FriendRow[] = [];
      try {
        const r = await fetch(`/friends/${data.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        rows = (await r.json()) as FriendRow[];
      } catch {
        /* ignore */
      }
  
      if (!Array.isArray(rows) || !rows.length) {
        extraBox.textContent = "No friends to show.";
        return;
      }
  
      const ul = document.createElement("ul");
      rows.forEach(u => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="view-profile cursor-pointer text-[color:var(--link,#06c)] hover:underline" data-userid="${u.id}">${u.username}</span>`;
        ul.appendChild(li);
      });
      extraBox.replaceChildren(ul);
    };
  
    histBtn.onclick = async () => {
      extraBox.innerHTML = "<p>Loading…</p>";
      let games: GameHistoryRow[] = [];
      try {
        const r = await fetch(`/history/${data.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        games = (await r.json()) as GameHistoryRow[];
      } catch {
        /* ignore */
      }
  
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
        const youWon = g.winnerId === data.id;
        row.innerHTML = `<td>${g.timestamp.slice(0, 10)}</td><td>${youWon ? "Win" : "Loss"}</td><td>${g.scoreWinner} – ${g.scoreLoser}</td>`;
        tb.appendChild(row);
      });
  
      tbl.appendChild(tb);
      extraBox.replaceChildren(tbl);
    };
  }
  
  /** -------------------------------------------------------------------------
   *  ADD/REMOVE FRIEND  &  BLOCK/UNBLOCK buttons
   *  ------------------------------------------------------------------------*/
  
  function wireFriendBlock(ov: HTMLElement, data: UserProfileData): void {
    const friendBtn = ov.querySelector<HTMLButtonElement>("#pr-friend-action")!;
    const blockBtn  = ov.querySelector<HTMLButtonElement>("#pr-block-action")!;
    const token     = localStorage.getItem("token");
  
    friendBtn.classList.add("hidden");
    blockBtn.classList.add("hidden");
  
    // Hide both if viewing own profile
    if (data.id === window.__CURRENT_USER_ID) return;
  
    // Fetch my own lists first
    (async () => {
      const r = await fetch("/currentuser", { headers: { Authorization: `Bearer ${token}` } });
      const me = (await r.json()) as { friends?: string; blocked_users?: string };
  
      const friends: number[] = me.friends ? JSON.parse(me.friends).map(Number) : [];
      const blocked: number[] = me.blocked_users ? JSON.parse(me.blocked_users).map(Number) : [];
  
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
  
      // Friend toggle
      friendBtn.onclick = async () => {
        const isFriend = friends.includes(data.id);
        const method = isFriend ? "DELETE" : "POST";
        const res = await fetch("/friend", {
          method,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
  
      // Block toggle
      blockBtn.onclick = async () => {
        const isBlocked = blocked.includes(data.id);
        const method = isBlocked ? "DELETE" : "POST";
        const res = await fetch("/block", {
          method,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
/** -----------------------------------------------------------------------
 *  NAVBAR PROFILE INITIALISATION (migrated from chat/app.js)
 *  --------------------------------------------------------------------*/

export function initNavProfile(): void {
  let userInfoGlobal: any;

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
    avatarEl.classList.add("view-profile", "cursor-pointer");
  }

  (async () => {
    const userInfo = userInfoGlobal;
    localStorage.setItem("token", userInfo.token);

    const me = await fetch("/currentuser", {
      headers: { Authorization: `Bearer ${userInfo.token}` }
    }).then(r => r.json()).catch(() => null);
    if (!me) { window.location.href = "/login"; return; }
    __CURRENT_USER_ID = window.__CURRENT_USER_ID = me.id;
    const avatar = document.getElementById("navAvatar");
    if (avatar) avatar.dataset.userid = String(me.id);
    const nameEl = document.getElementById("navUsername");
    if (nameEl) {
      nameEl.dataset.userid = String(me.id);
      nameEl.classList.add("view-profile", "cursor-pointer");
    }
  })();

  if (!_navProfileInitDone) {
    document.body.addEventListener("click", e => {
      const t = (e.target as HTMLElement).closest(".view-profile");
      if (!t) return;

      const raw = (t as HTMLElement).dataset.userid;
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
    nameEl.dataset.userid = String(userInfoGlobal.id);
    nameEl.classList.add("view-profile", "cursor-pointer");
  }
}

initNavProfile();
 