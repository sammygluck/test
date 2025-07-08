import { logout } from "../login/script.js";
import { game, GameMessage } from "../game_websocket/pong_websocket.js";

interface Player {
	id: number;
	username: string;
	score?: number;
}

interface Tournament {
	id: number;
	name: string;
	creator: Player;
	players: Player[];
	started: boolean;
}

interface UserInfo {
	id: number;
	token: string;
	username: string;
	avatar: string | null;
}

type ClientMessage =
	| { type: "list_tournaments" }
	| { type: "create_tournament"; name: string }
	| { type: "subscribe"; tournament: number }
	| { type: "start_tournament"; tournament: number };

interface TournamentsMessage {
	type: "tournaments";
	data: Tournament[];
}

interface matchData {
	player1: Player;
	player2: Player;
	winner?: Player | null;
	round: number;
}

interface tournamentUpdateMessage {
	type: "nextMatch" | "tournamentUpdate";
	data: matchData;
}

interface countDownMessage {
	type: "countDown";
	time: number;
}

type ServerMessage =
	| TournamentsMessage
	| GameMessage
	| tournamentUpdateMessage
	| countDownMessage;

// Element references
const tournamentList = document.getElementById(
	"tournamentList"
) as HTMLUListElement;
const createTournamentForm = document.getElementById(
	"createTournamentForm"
) as HTMLFormElement;
const tournamentNameInput = document.getElementById(
	"tournamentName"
) as HTMLInputElement;

const selectedTitle = document.getElementById(
	"selectedTournamentTitle"
) as HTMLElement;
const playerList = document.getElementById("playerList") as HTMLUListElement;
const subscribeBtn = document.getElementById(
	"subscribeBtn"
) as HTMLButtonElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const statusMessage = document.getElementById("statusMessage") as HTMLElement;

// State
let tournaments: Tournament[] = [];
let selectedTournament: number | null = null;
let userInfo: UserInfo | null = null;
let ws: WebSocket | null = null;

function connectGameServer(): void {
	// This function is called to connect to the game server
	// Load user info
	const userInfoStr = localStorage.getItem("userInfo");
	if (!userInfoStr) {
		return;
	}
	userInfo = JSON.parse(userInfoStr!);
	if (!userInfo || !userInfo.token) {
		return;
	}

	// WebSocket setup
	if (ws) {
		console.warn("Already connected to the game server");
		return;
	}
	ws = new WebSocket(
		`wss://${window.location.host}/game?token=${userInfo.token}`
	);

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
		/*console.log("Reconnecting in 5 seconds...");
		setTimeout(() => {
			connectGameServer();
		}, 5000);*/
	});

	ws.addEventListener("open", () => {
		const msg: ClientMessage = { type: "list_tournaments" };
		ws.send(JSON.stringify(msg));
		game.updateWebSocket(ws);
	});

	ws.addEventListener("message", (event) => {
		const msg: ServerMessage = JSON.parse(event.data);

		if (msg.type === "tournaments") {
			tournaments = msg.data;
			renderTournamentList();
			if (selectedTournament !== null) {
				selectTournament(selectedTournament);
			}
		} else if (msg.type === "game") {
			// Handle game updates
			game.updateGameState(msg as GameMessage);
		} else if (msg.type === "nextMatch") {
			// Handle next match updates
			const tournamentUpdate = msg as tournamentUpdateMessage;
			updateGameHeader(tournamentUpdate);
		} else if (msg.type === "tournamentUpdate") {
			updateScore(msg.data.player1.score, msg.data.player2.score);
		} else if (msg.type === "countDown") {
			updateCountDown(msg.time);
		}
	});

	// Form: create tournament
	createTournamentForm.addEventListener("submit", (e) => {
		e.preventDefault();
		const name = tournamentNameInput.value.trim();
		if (!name) return;

		const msg: ClientMessage = { type: "create_tournament", name };
		ws.send(JSON.stringify(msg));
		tournamentNameInput.value = "";
	});

	// Subscribe to tournament
	subscribeBtn.addEventListener("click", subscribeBtnClick);

	// Start tournament
	startBtn.addEventListener("click", startBtnClick);
	console.log("Connected to the game server");
}

function disconnectGameServer(): void {
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

function startBtnClick(): void {
	if (selectedTournament === null) return;
	const msg: ClientMessage = {
		type: "start_tournament",
		tournament: selectedTournament,
	};
	ws.send(JSON.stringify(msg));
}

function subscribeBtnClick(): void {
	if (selectedTournament === null) return;
	const msg: ClientMessage = {
		type: "subscribe",
		tournament: selectedTournament,
	};
	ws.send(JSON.stringify(msg));
}

// Render list of tournaments
function renderTournamentList(): void {
	tournamentList.innerHTML = "";
	tournaments.forEach((t) => {
		const li = document.createElement("li");
		li.textContent = t.name;
                li.className =
                        "cursor-pointer p-2 rounded border border-blue-950 bg-amber-50 hover:bg-amber-100 text-blue-950";
		li.addEventListener("click", () => selectTournament(t.id));
		tournamentList.appendChild(li);
	});
}

// Select a tournament
function selectTournament(id: number): void {
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

	// Render players
	playerList.innerHTML = "";
	tournament.players.forEach((player) => {
		const li = document.createElement("li");
		li.textContent = player.username;
                li.className =
                        "border border-blue-950 p-2 rounded bg-amber-50 text-blue-950";
		playerList.appendChild(li);
	});

	const isCreator = userInfo && userInfo.id === tournament.creator.id;
	const playerIds = tournament.players.map((p) => p.id);

	if (!tournament.started && userInfo && !playerIds.includes(userInfo.id)) {
		subscribeBtn.classList.remove("hidden");
	} else {
		subscribeBtn.classList.add("hidden");
	}

	if (!tournament.started && isCreator) {
		startBtn.classList.remove("hidden");
	} else {
		startBtn.classList.add("hidden");
	}
}

// if logged in on page load, connect to the game server
if (localStorage.getItem("userInfo")) {
	connectGameServer();
}

// Game header
const player1Avatar = document.getElementById(
	"player1Avatar"
) as HTMLImageElement;
const player2Avatar = document.getElementById(
	"player2Avatar"
) as HTMLImageElement;
const player1Name = document.getElementById("player1Name") as HTMLElement;
const player2Name = document.getElementById("player2Name") as HTMLElement;
const scoreDisplay = document.getElementById("scoreDisplay") as HTMLElement;
const countDownDisplay = document.getElementById(
	"countDownDisplay"
) as HTMLElement;

// Update game header with player info
async function updateGameHeader(
	tournamentUpdateMessage: tournamentUpdateMessage
): Promise<void> {
	const { player1, player2 } = tournamentUpdateMessage.data;

	//player1Name.textContent = player1.username;
	//player2Name.textContent = player2.username;

	let response = await fetch("/user/" + player1.id, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${localStorage.getItem("token")}`,
		},
	});
	const player1Data = await response.json();
	if (response.ok && player1Data) {
		player1Name.textContent = player1Data.username;
		player1Avatar.src = player1Data.avatar || "default-avatar.svg"; // Fallback avatar
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
		player2Avatar.src = player2Data.avatar || "default-avatar.svg"; // Fallback avatar
	}
	const player1Score = player1.score || 0;
	const player2Score = player2.score || 0;
	scoreDisplay.textContent = `${player1Score} - ${player2Score}`;
	countDownDisplay.textContent = "5"; // Reset countdown display
}
function updateCountDown(time: number): void {
	countDownDisplay.textContent = time.toString();
	if (time <= 0) {
		countDownDisplay.textContent = "Go!";
	}
	scoreDisplay.classList.add("hidden");
	countDownDisplay.classList.remove("hidden");
}
function updateScore(player1Score: number, player2Score: number): void {
	scoreDisplay.textContent = `${player1Score} - ${player2Score}`;
	countDownDisplay.classList.add("hidden");
	scoreDisplay.classList.remove("hidden");
}

export { connectGameServer, disconnectGameServer };
