/*
 * Servidor HTTP + WebSocket do projeto acadêmico de enquete em tempo real.
 * Ele mantém os votos e a quantidade de clientes conectados na memória e distribui
 * mensagens JSON para todos os navegadores, sem que eles precisem atualizar a página.
 * Para fins didáticos, os dados são reiniciados quando o servidor é encerrado.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const OPTIONS = ["dark-mode", "notifications", "reports"];
const QUESTION = "Qual recurso você gostaria de ver no próximo projeto?";

// Estado compartilhado do servidor: todos os clientes consultam a mesma contagem.
const votes = Object.fromEntries(OPTIONS.map((id) => [id, 0]));
const clients = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = http.createServer((request, response) => {
  // Só disponibiliza os três arquivos estáticos da interface.
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const allowedFiles = {
    "/": "index.html",
    "/index.html": "index.html",
    "/style.css": "style.css",
    "/client.js": "client.js",
  };
  const filename = allowedFiles[pathname];

  if (!filename) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Página não encontrada.");
    return;
  }

  const filePath = path.join(ROOT_DIR, filename);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Erro ao carregar os arquivos do projeto.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  });
});

const wss = new WebSocketServer({ server });

function sendJson(client, type, payload) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ type, payload }));
  }
}

function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

function getState() {
  return {
    question: QUESTION,
    options: OPTIONS,
    votes: { ...votes },
    activeUsers: clients.size,
  };
}

wss.on("connection", (client) => {
  // Cada conexão recebe um identificador simples e pode votar uma única vez.
  const user = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, hasVoted: false };
  clients.set(client, user);

  sendJson(client, "initial_state", getState());
  broadcast("user_joined", { activeUsers: clients.size });
  console.log(`Cliente conectado. Participantes online: ${clients.size}`);

  client.on("message", (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      sendJson(client, "error", { message: "Mensagem inválida: envie um JSON válido." });
      return;
    }

    // O servidor valida o tipo e a opção; não confia apenas na interface do navegador.
    if (message.type !== "vote") {
      sendJson(client, "error", { message: "Tipo de mensagem não reconhecido." });
      return;
    }

    const optionId = message.payload && message.payload.optionId;
    if (!OPTIONS.includes(optionId)) {
      sendJson(client, "error", { message: "Opção de voto inválida." });
      return;
    }

    const currentUser = clients.get(client);
    if (!currentUser || currentUser.hasVoted) {
      sendJson(client, "error", { message: "Você já registrou seu voto nesta conexão." });
      return;
    }

    currentUser.hasVoted = true;
    votes[optionId] += 1;

    sendJson(client, "vote_accepted", { optionId });
    // Todos os clientes recebem a contagem atualizada pelo mesmo evento JSON.
    broadcast("state_update", getState());
    console.log(`Voto registrado em "${optionId}". Total: ${OPTIONS.reduce((sum, id) => sum + votes[id], 0)}`);
  });

  client.on("close", () => {
    clients.delete(client);
    broadcast("user_left", { activeUsers: clients.size });
    console.log(`Cliente desconectado. Participantes online: ${clients.size}`);
  });

  client.on("error", (error) => {
    console.error("Erro no WebSocket:", error.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Enquete disponível em http://localhost:${PORT}`);
});
