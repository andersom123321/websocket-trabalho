/*
 * Cliente WebSocket da enquete acadêmica.
 * Envia votos em JSON e atualiza o gráfico, os totais e a quantidade de participantes
 * ao receber eventos do servidor, sem recarregar a página.
 */
const OPTION_IDS = ["dark-mode", "notifications", "reports"];

const voteForm = document.querySelector("#vote-form");
const voteButton = document.querySelector("#vote-button");
const voteFeedback = document.querySelector("#vote-feedback");
const totalVotesElement = document.querySelector("#total-votes");
const activeUsersElement = document.querySelector("#active-users");
const connectionStatus = document.querySelector("#connection-status");
const optionInputs = [...document.querySelectorAll('input[name="option"]')];

let socket;
let hasVoted = false;
let isConnected = false;

function setFeedback(message, type = "") {
  voteFeedback.textContent = message;
  voteFeedback.className = `feedback ${type}`.trim();
}

function setConnectionStatus(message, type = "") {
  connectionStatus.textContent = message;
  connectionStatus.className = `connection-status ${type}`.trim();
}

function updateVoteButton() {
  const selectedOption = document.querySelector('input[name="option"]:checked');
  voteButton.disabled = !isConnected || hasVoted || !selectedOption;
}

// Atualiza todos os indicadores usando o estado compartilhado recebido do servidor.
function renderState(state) {
  const votes = state.votes || {};
  const total = OPTION_IDS.reduce((sum, id) => sum + (votes[id] || 0), 0);
  totalVotesElement.textContent = String(total);

  OPTION_IDS.forEach((id) => {
    const count = votes[id] || 0;
    const percentage = total === 0 ? 0 : Math.round((count / total) * 100);
    const bar = document.querySelector(`#bar-${id}`);
    const countLabel = document.querySelector(`#count-${id}`);

    bar.style.width = `${percentage}%`;
    bar.setAttribute("aria-valuenow", String(percentage));
    countLabel.textContent = `${count} · ${percentage}%`;
  });

  if (typeof state.activeUsers === "number") {
    activeUsersElement.textContent = String(state.activeUsers);
  }
}

function sendMessage(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    // Todas as mensagens trocadas com o servidor seguem o formato JSON.
    socket.send(JSON.stringify(message));
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${window.location.host}`);

  socket.addEventListener("open", () => {
    isConnected = true;
    setConnectionStatus("Conectado", "connected");
    setFeedback("Conectado! Escolha uma opção para votar.");
    updateVoteButton();
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      setFeedback("O servidor enviou uma mensagem inválida.", "error");
      return;
    }

    // Os tipos de evento permitem identificar como tratar cada mensagem recebida.
    switch (message.type) {
      case "initial_state":
      case "state_update":
        renderState(message.payload);
        break;

      case "user_joined":
      case "user_left":
        activeUsersElement.textContent = String(message.payload.activeUsers);
        break;

      case "vote_accepted":
        hasVoted = true;
        optionInputs.forEach((input) => { input.disabled = true; });
        setFeedback("Voto registrado! Obrigado por participar.", "success");
        updateVoteButton();
        break;

      case "error":
        setFeedback(message.payload.message || "Não foi possível processar a solicitação.", "error");
        break;

      default:
        console.warn("Tipo de evento desconhecido:", message.type);
    }
  });

  socket.addEventListener("close", () => {
    isConnected = false;
    setConnectionStatus("Desconectado", "disconnected");
    setFeedback("Conexão perdida. Recarregue a página para tentar novamente.", "error");
    updateVoteButton();
  });

  socket.addEventListener("error", () => {
    setConnectionStatus("Erro de conexão", "disconnected");
    setFeedback("Não foi possível conectar ao servidor WebSocket.", "error");
  });
}

voteForm.addEventListener("change", updateVoteButton);
voteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedOption = document.querySelector('input[name="option"]:checked');

  if (!selectedOption || hasVoted || !isConnected) return;

  sendMessage({
    type: "vote",
    payload: { optionId: selectedOption.value },
  });
});

connectWebSocket();
