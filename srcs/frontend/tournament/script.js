import { logout } from "../login/script.js";
import { game } from "../game_websocket/pong_websocket.js";
const tournamentList = document.getElementById("tournamentList");
const createTournamentForm = document.getElementById("createTournamentForm");
const tournamentNameInput = document.getElementById("tournamentName");
const selectedTitle = document.getElementById("selectedTournamentTitle");
const playerList = document.getElementById("playerList");
const subscribeBtn = document.getElementById("subscribeBtn");
const startBtn = document.getElementById("startBtn");
const statusMessage = document.getElementById("statusMessage");
let tournaments = [];
let selectedTournament = null;
let userInfo = null;
let ws = null;
function connectGameServer() {
    const userInfoStr = localStorage.getItem("userInfo");
    if (!userInfoStr) {
        return;
    }
    userInfo = JSON.parse(userInfoStr);
    if (!userInfo || !userInfo.token) {
        return;
    }
    if (ws) {
        console.warn("Already connected to the game server");
        return;
    }
    ws = new WebSocket(`wss://${window.location.host}/game?token=${userInfo.token}`);
    ws.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
        disconnectGameServer();
    });
    ws.addEventListener("close", (e) => {
        switch (e.code) {
            case 4000:
                console.log("No token provided");
                logout();
                break;
            case 4001:
                console.log("Invalid token");
                logout();
                break;
            default:
                console.log("Game websocket connection closed");
        }
    });
    ws.addEventListener("open", () => {
        const msg = { type: "list_tournaments" };
        ws.send(JSON.stringify(msg));
        game.updateWebSocket(ws);
    });
    ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "tournaments") {
            tournaments = msg.data;
            renderTournamentList();
            if (selectedTournament !== null) {
                selectTournament(selectedTournament);
            }
        }
        else if (msg.type === "game") {
            game.updateGameState(msg);
        }
        else if (msg.type === "nextMatch") {
            const tournamentUpdate = msg;
            updateGameHeader(tournamentUpdate);
        }
        else if (msg.type === "tournamentUpdate") {
            updateScore(msg.data.player1.score, msg.data.player2.score);
        }
        else if (msg.type === "countDown") {
            updateCountDown(msg.time);
        }
    });
    createTournamentForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = tournamentNameInput.value.trim();
        if (!name)
            return;
        const msg = { type: "create_tournament", name };
        ws.send(JSON.stringify(msg));
        tournamentNameInput.value = "";
    });
    subscribeBtn.addEventListener("click", subscribeBtnClick);
    startBtn.addEventListener("click", startBtnClick);
    console.log("Connected to the game server");
}
function disconnectGameServer() {
    if (ws) {
        ws.close();
        ws = null;
        console.log("Disconnected from the game server");
    }
    selectedTournament = null;
    tournaments = [];
    renderTournamentList();
    subscribeBtn.removeEventListener("click", subscribeBtnClick);
    startBtn.removeEventListener("click", startBtnClick);
}
function startBtnClick() {
    if (selectedTournament === null)
        return;
    const msg = {
        type: "start_tournament",
        tournament: selectedTournament,
    };
    ws.send(JSON.stringify(msg));
}
function subscribeBtnClick() {
    if (selectedTournament === null)
        return;
    const msg = {
        type: "subscribe",
        tournament: selectedTournament,
    };
    ws.send(JSON.stringify(msg));
}
function renderTournamentList() {
    tournamentList.innerHTML = "";
    tournaments.forEach((t) => {
        const li = document.createElement("li");
        li.textContent = t.name;
        li.className =
            "cursor-pointer p-2 rounded border border-blue-950 bg-white hover:bg-blue-100 text-blue-950";
        li.addEventListener("click", () => selectTournament(t.id));
        tournamentList.appendChild(li);
    });
}
function selectTournament(id) {
    console.log("Selected tournament:", id);
    selectedTournament = id;
    const tournament = tournaments.find((t) => t.id === id) || null;
    if (!tournament) {
        selectedTitle.textContent = "Select a tournament";
        statusMessage.textContent = "No tournament";
        playerList.innerHTML = "";
        subscribeBtn.classList.add("hidden");
        startBtn.classList.add("hidden");
        return;
    }
    selectedTitle.textContent = `Players in "${tournament.name}"`;
    statusMessage.textContent = tournament.started
        ? "🏁 This tournament is starting."
        : `Creator: ${tournament.creator.username}`;
    playerList.innerHTML = "";
    tournament.players.forEach((player) => {
        const li = document.createElement("li");
        li.textContent = player.username;
        li.className =
            "border border-blue-950 p-2 rounded bg-white text-blue-950";
        playerList.appendChild(li);
    });
    const isCreator = userInfo && userInfo.id === tournament.creator.id;
    const playerIds = tournament.players.map((p) => p.id);
    if (!tournament.started && userInfo && !playerIds.includes(userInfo.id)) {
        subscribeBtn.classList.remove("hidden");
    }
    else {
        subscribeBtn.classList.add("hidden");
    }
    if (!tournament.started && isCreator) {
        startBtn.classList.remove("hidden");
    }
    else {
        startBtn.classList.add("hidden");
    }
}
if (localStorage.getItem("userInfo")) {
    connectGameServer();
}
const player1Avatar = document.getElementById("player1Avatar");
const player2Avatar = document.getElementById("player2Avatar");
const player1Name = document.getElementById("player1Name");
const player2Name = document.getElementById("player2Name");
const scoreDisplay = document.getElementById("scoreDisplay");
const countDownDisplay = document.getElementById("countDownDisplay");
async function updateGameHeader(tournamentUpdateMessage) {
    const { player1, player2 } = tournamentUpdateMessage.data;
    let response = await fetch("/user/" + player1.id, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
    });
    const player1Data = await response.json();
    if (response.ok && player1Data) {
        player1Name.textContent = player1Data.username;
        player1Avatar.src = player1Data.avatar || "default-avatar.svg";
    }
    response = await fetch("/user/" + player2.id, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
    });
    const player2Data = await response.json();
    if (response.ok && player2Data) {
        player2Name.textContent = player2Data.username;
        player2Avatar.src = player2Data.avatar || "default-avatar.svg";
    }
    const player1Score = player1.score || 0;
    const player2Score = player2.score || 0;
    scoreDisplay.textContent = `${player1Score} - ${player2Score}`;
    countDownDisplay.textContent = "5";
}
function updateCountDown(time) {
    countDownDisplay.textContent = time.toString();
    if (time <= 0) {
        countDownDisplay.textContent = "Go!";
    }
    scoreDisplay.classList.add("hidden");
    countDownDisplay.classList.remove("hidden");
}
function updateScore(player1Score, player2Score) {
    scoreDisplay.textContent = `${player1Score} - ${player2Score}`;
    countDownDisplay.classList.add("hidden");
    scoreDisplay.classList.remove("hidden");
}
export { connectGameServer, disconnectGameServer };
