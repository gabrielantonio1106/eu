/**
 * n8n Code Node — "Cérebro" completo do Fibbage (WhatsApp) — Lobby → Sala → Config → Partida (Clássico + EAY)
 *
 * ✅ Regras implementadas conforme a simulação.
 */

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj ?? {}));
}

function clamp(n, a, b) {
  n = Number(n);
  if (Number.isNaN(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function pad2(n) {
  const s = String(n);
  return s.length === 1 ? `0${s}` : s.slice(-2);
}

function normalizeAnswerText(s) {
  return String(s ?? "").trim().toLowerCase();
}

function parseIntStrict(s) {
  const t = String(s ?? "").trim();
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseMenuNumberLoose(s) {
  const raw = String(s ?? "").trim();
  if (!raw) return null;
  const keycapNorm = raw.replace(/([0-9])️?⃣/g, "$1");
  const normalized = keycapNorm.replace(/^\s*,\s*/, "").trim();

  const strict = parseIntStrict(normalized);
  if (strict !== null) return strict;

  // aceita formatos comuns: "1)", "1.", "opção 2", "número 3"
  const m = normalized.match(/(^|\D)(-?\d{1,2})(?=\D|$)/);
  if (!m) return null;
  const n = Number(m[2]);
  return Number.isFinite(n) ? n : null;
}

function fisherYatesShuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeRng(seedStr) {
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seed = xmur3(seedStr)();
  return mulberry32(seed);
}

function lettersFor(n) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const out = [];
  for (let i = 0; i < n; i++) out.push(alphabet[i] ?? `(${i + 1})`);
  return out;
}

function actionSend({ channel, chat_id, text, delay_seconds = 0 }) {
  const d = Math.max(0, Math.floor(Number(delay_seconds) || 0));
  return {
    json: {
      route: "send",
      payload: {
        chat_id: String(chat_id ?? ""),
        message: String(text ?? ""),
        delay_sec: d,
        ...(channel ? { channel: String(channel) } : {}),
      },
    },
  };
}

function actionAiJob(payload, state, message) {
  const p = deepClone(payload || {});
  if (!p.reason) return null;

  const r = String(p.reason).trim().toUpperCase();
  let reason = r;
  if (!/^HELP_|^NARRATE_|^GENERATE_/.test(reason)) {
    if (reason.includes("REVEAL") || reason.includes("NARR")) reason = "NARRATE_REVEAL";
    else if (reason.includes("QUESTION")) reason = "GENERATE_QUESTION";
    else if (reason.includes("LIE")) reason = "GENERATE_LIE";
    else reason = "HELP_GENERAL";
  }
  p.reason = reason;

  if (!p.scene) p.scene = reason.toLowerCase();

  const msg = message || {};
  p.target_chat_id = String(p.target_chat_id ?? msg.chat_id ?? "");
  p.sender_chat_id = String(p.sender_chat_id ?? msg.sender_chat_id ?? "");
  p.sender_name = String(p.sender_name ?? msg.sender_name ?? "");
  p.sala_id = String(p.sala_id ?? "");

  if (p.estado_json_raw && typeof p.estado_json_raw !== "string") p.estado_json_raw = JSON.stringify(p.estado_json_raw);
  if (p.status_json && typeof p.status_json !== "string") p.status_json = JSON.stringify(p.status_json);
  if (p.datastore_text == null) p.datastore_text = "";
  if (p.context_all_text == null) p.context_all_text = "";

  return { json: { route: "ai_job", payload: p } };
}

function buildParticipantStatusJson({ state, pid, room, role, salaId, message }) {
  const ctx = deepClone(state?.user_context?.[pid] || {});
  const user = deepClone(state?.users?.[pid] || {});
  const msg = message && typeof message === "object" ? message : {};

  const roomSnapshot = room
    ? {
        code: String(room.code ?? salaId ?? ""),
        name: String(room.name ?? ""),
        status: String(room.status ?? ""),
        mode: String(room.mode ?? ""),
        phase: String(room?.game?.phase ?? ""),
        round_index: Number(room?.game?.round_index ?? 0),
        rounds_total: Number(room?.rounds_total ?? 0),
        host_chat_id: String(room?.host_chat_id ?? ""),
        screen_group_id: String(room?.screen_group_id ?? ""),
      }
    : null;

  const awaitingInputSteps = new Set([
    "SET_NAME",
    "ROOM_CREATE_NAME",
    "ROOM_CREATE_PASSWORD",
    "ENTER_PASSWORD",
    "CONFIG_SET_PASSWORD",
  ]);

  return {
    context: ctx,
    user_profile: {
      name: String(user?.name ?? user?.last_seen_name ?? "Jogador"),
      last_seen_name: String(user?.last_seen_name ?? ""),
      created_at: user?.created_at ?? null,
    },
    runtime: {
      role: String(role ?? "player"),
      sala_id: String(salaId ?? "BOT_ACCESS"),
      has_active_room: !!room,
      room: roomSnapshot,
      updated_at: new Date().toISOString(),
      source_chat_type: String(msg?.chat_type ?? ""),
      source_chat_id: String(msg?.chat_id ?? ""),
      source_sender_id: String(msg?.sender_chat_id ?? ""),
      awaiting_text_input: awaitingInputSteps.has(String(ctx?.step ?? "")),
    },
  };
}

function buildOutput(state, actions = [], debugObj = null, message = {}) {
  const out = [];

  for (const act of actions || []) {
    if (!act || !act.json || !act.json.route) continue;

    if (act.json.route === "send") {
      const p = act.json.payload || {};
      const d = Math.max(0, Math.floor(Number(p.delay_sec) || 0));
      out.push({
        json: {
          route: "send",
          payload: {
            chat_id: String(p.chat_id ?? ""),
            message: String(p.message ?? ""),
            delay_sec: d,
            ...(p.channel ? { channel: String(p.channel) } : {}),
          },
        },
      });
      continue;
    }

    out.push(act);
  }

  try {
    const msg = typeof message === "object" && message ? message : {};
    const senderId = String(msg.sender_chat_id ?? "");
    const ctx = state?.user_context?.[senderId] || {};
    const explicitRoom = String(ctx.current_room_code ?? "");
    let room = null;

    if (explicitRoom && state?.rooms?.[explicitRoom] && state.rooms[explicitRoom].status !== "ENDED") {
      room = state.rooms[explicitRoom];
    } else if (senderId && state?.rooms) {
      for (const r of Object.values(state.rooms)) {
        if (r?.status !== "ENDED" && r?.players?.[senderId]) {
          room = r;
          break;
        }
      }
    }

    const nowIso = new Date().toISOString();

    const upsertSala = (r) => {
      if (!r) return;
      const vis =
        r.visibility === "publica" ? "PUBLICA" :
        r.visibility === "privada" ? "PRIVADA" :
        r.visibility === "oculta" ? "OCULTA" :
        String(r.visibility || "").toUpperCase() || "PUBLICA";

      out.push({
        json: {
          route: "upsert_salas",
          payload: {
            sala_id: String(r.code ?? r.sala_id ?? ""),
            nome: String(r.name ?? ""),
            visibilidade: vis,
            senha: r.password ? String(r.password) : "",
            max_jogadores: Number(r.max_players ?? r.max_jogadores ?? 8),
            rodadas_total: Number(r.rounds_total ?? r.rodadas_total ?? 5),
            host_chat_id: String(r.host_chat_id ?? ""),
            estado_json_raw: JSON.stringify(r),
          },
        },
      });
    };

    const upsertParticipante = (salaId, pid, pObj, rRoom = null) => {
      if (!pid) return;
      const joinedAt = pObj?.joined_at ? String(pObj.joined_at) : nowIso;
      const isBot = !!pObj?.is_bot;
      const role = rRoom && pid === rRoom.host_chat_id ? "host" : isBot ? "bot" : "player";
      const pontos = rRoom?.game?.scores?.[pid] ?? 0;
      const ctx = state?.user_context?.[pid] || {};
      const status = isBot ? "ativo" : (ctx.step === "BOT_INACTIVE" ? "inativo" : "ativo");

      out.push({
        json: {
          route: "upsert_participantes",
          payload: {
            sala_id: String(salaId),
            chat_id: String(pid),
            nome: String(pObj?.name ?? "Jogador"),
            role: String(role),
            status,
            pontos: Number(pontos) || 0,
            joined_at: joinedAt,
            status_json: JSON.stringify(buildParticipantStatusJson({ state, pid, room: rRoom, role, salaId, message: msg })),
          },
        },
      });
    };

    if (room) {
      upsertSala(room);
      const salaId = String(room.code ?? "");
      for (const pid of room.players_order || []) {
        const pObj = room.players?.[pid] || { name: "Jogador", is_bot: false };
        upsertParticipante(salaId, pid, pObj, room);
      }
    } else if (senderId) {
      const name = state?.users?.[senderId]?.name ?? msg.sender_name ?? "Jogador";
      upsertParticipante("BOT_ACCESS", senderId, { name, is_bot: false }, null);
    }
  } catch (e) {}

  return out;
}

function isHost(room, sender_chat_id) {
  return room && room.host_chat_id && sender_chat_id === room.host_chat_id;
}

function roomPanelText(room) {
  const visEmoji = room.visibility === "publica" ? "🔓" : room.visibility === "privada" ? "🔒" : "🙈";
  const visLabel = room.visibility === "publica" ? "Pública" : room.visibility === "privada" ? "Privada" : "Oculta";
  const pwd = room.visibility === "publica" ? "" : "\n🔐 Protegida por senha";
  const players = room.players_order
    .map((pid, idx) => {
      const p = room.players[pid];
      if (!p) return null;
      const hostTag = pid === room.host_chat_id ? " (Host)" : "";
      const botTag = p.is_bot ? " 🤖" : "";
      return `${idx + 1}️⃣ ${p.name}${hostTag}${botTag}`;
    })
    .filter(Boolean);

  const qt = room.question_types || { classica: true, vhs: true, manchete: true, instrucao: true };
  const qtList = [];
  if (qt.classica) qtList.push("Clássica");
  if (qt.vhs) qtList.push("VHS");
  if (qt.manchete) qtList.push("Manchete");
  if (qt.instrucao) qtList.push("Instruções");
  const qtText = qtList.length ? qtList.join(", ") : "—";

  return [
    "━━━━━━━━━━━━━━━",
    `🎲 SALA: ${room.name}`,
    `🆔 Código: ${room.code}`,
    `🎮 Modo: ${room.mode === "EAY" ? "EAY (Enough About You)" : "Clássico"}`,
    `${visEmoji} Visibilidade: ${visLabel}${pwd}`,
    `👑 Host: ${room.players[room.host_chat_id]?.name ?? "—"}`,
    "",
    `👥 Jogadores (${players.length}/${room.max_players})`,
    ...players,
    "",
    `🔢 Rodadas: ${room.rounds_total}`,
    `⭐ Tipos de pergunta: ${qtText}`,
    "━━━━━━━━━━━━━━━",
  ].join("\n");
}

function lobbyMenuText() {
  return [
    "📋✨ MENU – LOBBY",
    "",
    "🛠️ criar → Criar uma nova sala",
    "🏠 salas → Ver salas públicas disponíveis",
    "🔑 entrar XX → Entrar em uma sala existente",
    "🪪 nome Seu Nome → Alterar seu nome de jogador",
    "🤖 ,desativarbot → Desativar o bot (sair do atendimento)",
    "",
    "🎯 O que você quer fazer?",
  ].join("\n");
}



function configMenuText(room) {
  return [
    `⚙️ CONFIGURAÇÕES DA SALA — ${room.name}`,
    "",
    "━━━━━━━━━━━━━━━",
    "1️⃣ Alterar número de rodadas",
    "2️⃣ Tipos de pergunta",
    "3️⃣ Alterar máximo de jogadores",
    "4️⃣ Alterar visibilidade",
    "5️⃣ Alterar modo (Clássico / EAY)",
    "6️⃣ Encerrar sala",
    "0️⃣ Voltar ao painel da sala",
    "━━━━━━━━━━━━━━━",
    "",
    "Digite o número da opção 👇",
  ].join("\n");
}
function listRoomsText(state) {
  const rooms = Object.values(state.rooms || {}).filter((r) => r && (r.visibility === "publica" || r.visibility === "privada") && r.status !== "ENDED");
  if (!rooms.length) {
    return [
      "🎲 SALAS DISPONÍVEIS",
      "",
      "😶‍🌫️ No momento não há salas públicas/privadas abertas.",
      "",
      "🛠️ Você pode criar a sua própria sala agora mesmo!",
      "Digite criar para começar 🚀",
    ].join("\n");
  }

  const blocks = rooms.slice(0, 10).map((r) => {
    const vis = r.visibility === "publica" ? "🔓 Pública" : "🔒 Privada";
    const playersCount = r.players_order?.length ?? 0;
    return [
      "━━━━━━━━━━━━━━━",
      `🆔 ${r.code}`,
      `🎲 Nome: ${r.name}`,
      `🎮 Modo: ${r.mode === "EAY" ? "EAY" : "Clássico"}`,
      `👥 ${playersCount}/${r.max_players} jogadores`,
      `${vis}`,
    ].join("\n");
  });

  return [
    "🎲 SALAS DISPONÍVEIS",
    ...blocks,
    "━━━━━━━━━━━━━━━",
    "Para entrar em uma sala, digite:",
    "entrar XX",
    "Exemplo:",
    "entrar 03",
    "",
    "Se a sala for privada, será solicitada a senha 🔐",
  ].join("\n");
}

function ensureStateBase(state) {
  const s = deepClone(state);
  if (!s.version) s.version = 1;
  if (!s.users) s.users = {};
  if (!s.rooms) s.rooms = {};
  if (!s.user_context) s.user_context = {};
  if (!s.next_room_code) s.next_room_code = 1;
  return s;
}

function getUserProfile(state, sender_chat_id, sender_name) {
  const u = state.users[sender_chat_id] || { name: sender_name || "Jogador", created_at: Date.now() };
  if (sender_name && sender_name.trim()) u.last_seen_name = sender_name.trim();
  if (!u.name) u.name = (sender_name || "Jogador").trim();
  state.users[sender_chat_id] = u;
  return u;
}

function getUserCtx(state, sender_chat_id) {
  const c = state.user_context[sender_chat_id] || { step: "BOT_INACTIVE", current_room_code: null, draft: null };
  state.user_context[sender_chat_id] = c;
  return c;
}

function allocateRoomCode(state) {
  for (let i = 0; i < 200; i++) {
    const code = pad2(((state.next_room_code || 1) - 1 + i) % 99 + 1);
    if (!state.rooms[code] || state.rooms[code].status === "ENDED") {
      state.next_room_code = (Number(code) % 99) + 1;
      return code;
    }
  }
  return pad2(Math.floor(Math.random() * 99) + 1);
}

function createRoomSkeleton({ code, host_chat_id, host_name }) {
  return {
    code,
    status: "CREATING",
    name: null,
    visibility: null,
    password: null,
    mode: "CLASSIC",
    rounds_total: 5,
    max_players: 8,
    question_types: { classica: true, vhs: true, manchete: true, instrucao: true },
    screen_group_id: null,
    host_chat_id,
    players: {
      [host_chat_id]: { chat_id: host_chat_id, name: host_name, is_bot: false },
    },
    players_order: [host_chat_id],
    game: {
      phase: "WAITING",
      round_index: 0,
      mode_runtime: null,
      waiting_reason: null,
      last_big_event: null,
      scores: { [host_chat_id]: 0 },
      round: null,
    },
  };
}

function parseIncoming(message) {
  const text = String(message.text ?? "").trim();
  const isGroup = message.chat_type === "group";
  const isPrivate = message.chat_type === "private";

  const sender_chat_id = String(message.sender_chat_id ?? "");
  const chat_id = String(message.chat_id ?? "");
  const sender_name = String(message.sender_name ?? "");

  if (isGroup) {
    const m = text.match(/^vinc\s+(\d{1,2})$/i);
    if (m) return { kind: "VINC", code: pad2(m[1]), sender_chat_id, sender_name, chat_id, text };
    if (text.startsWith(",")) return { kind: "GROUP_CMD", cmd: text.slice(1).trim().toLowerCase(), sender_chat_id, sender_name, chat_id, text };
    return { kind: "IGNORED_GROUP", sender_chat_id, sender_name, chat_id, text };
  }

  if (isPrivate) return { kind: "PRIVATE_TEXT", text, sender_chat_id, sender_name, chat_id };
  return { kind: "UNKNOWN", sender_chat_id, sender_name, chat_id, text };
}

function addPlayerToRoom(room, player_chat_id, player_name, is_bot = false) {
  if (!room.players[player_chat_id]) {
    room.players[player_chat_id] = { chat_id: player_chat_id, name: player_name, is_bot: !!is_bot };
    room.players_order.push(player_chat_id);
    room.game.scores[player_chat_id] = room.game.scores[player_chat_id] ?? 0;
  } else {
    room.players[player_chat_id].name = player_name || room.players[player_chat_id].name;
  }
}

function ensureUserInRoom(state, sender_chat_id, room_code) {
  const room = state.rooms[room_code];
  if (!room) return null;
  const u = state.users[sender_chat_id];
  const name = u?.name ?? u?.last_seen_name ?? "Jogador";
  addPlayerToRoom(room, sender_chat_id, name, false);
  return room;
}

function parseCommandPrivate(text) {
  const t = String(text ?? "").trim();
  const lower = t.toLowerCase();

  if (lower === "menu") return { cmd: "menu" };
  if (lower === "salas") return { cmd: "salas" };
  if (lower === "nome") return { cmd: "nome", name: "" };
  if (lower === "criar") return { cmd: "criar" };
  if (lower === "config") return { cmd: "config" };
  if (lower === "iniciar") return { cmd: "iniciar" };
  if (lower === "continuar") return { cmd: "continuar" };
  if (lower === "desativarbot" || lower === ",desativarbot") return { cmd: "desativarbot" };

  if (lower.startsWith("entrar ")) {
    const codeRaw = lower.split(/\s+/)[1] ?? "";
    return { cmd: "entrar", code: pad2(codeRaw) };
  }

  if (lower.startsWith("nome ")) return { cmd: "nome", name: t.slice(5).trim() };

  if (lower.startsWith("adicionar ") && lower.includes("bot")) {
    const m = lower.match(/^adicionar\s+(\d+)\s+bots?$/);
    if (m) return { cmd: "add_bots", n: clamp(m[1], 1, 7) };
  }

  const n = parseMenuNumberLoose(t);
  if (n !== null) return { cmd: "number", n };

  return { cmd: "text", text: t };
}

function parseCommandGroup(cmdText) {
  const c = String(cmdText ?? "").trim().toLowerCase();
  if (c === "continuar") return { cmd: "continuar" };
  if (c === "iniciar") return { cmd: "iniciar" };
  return { cmd: c };
}

function startTutorialActions({ room, mode }) {
  const group_id = room.screen_group_id;
  const actions = [];
  if (!group_id) return actions;

  if (mode === "EAY") {
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "📘 TUTORIAL — MODO EAY (Enough About You)" }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "🎯 Em cada rodada, um jogador vira o **Escolhido**.\nA pergunta é sobre ele.", delay_seconds: 2 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "🧑‍🎤 O Escolhido responde no privado com a verdade.", delay_seconds: 3 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "🕵️ Os outros inventam mentiras:\no que acham que o Escolhido responderia.", delay_seconds: 3 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "🗳️ Depois, todos votam tentando achar a resposta verdadeira do Escolhido.", delay_seconds: 3 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "🏆 Você ganha pontos:\n✅ ao acertar a verdade\n🪤 ao enganar alguém\n⭐ e pode rolar bônus pelo voto favorito do Escolhido.", delay_seconds: 3 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "👑 Host, quando quiser começar a Rodada 1, envie:\n,continuar", delay_seconds: 2 }));
  } else {
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "📘 TUTORIAL — COMO FUNCIONA O JOGO" }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "1️⃣ Você receberá uma frase com uma lacuna.\nSeu objetivo é inventar uma resposta convincente.", delay_seconds: 2 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "2️⃣ Todos enviam suas mentiras no privado.\nA resposta verdadeira será misturada com as mentiras.", delay_seconds: 3 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "3️⃣ Depois, todos votam na resposta que acham ser verdadeira.\n✅ Acertou: ganha pontos.\n🪤 Alguém votou na sua mentira: você ganha pontos.", delay_seconds: 3 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "🤖 Bots também jogam.\nEles mentem, votam e pontuam.", delay_seconds: 3 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "🎯 No final vence quem tiver mais pontos.", delay_seconds: 2 }));
    actions.push(actionSend({ channel: "group", chat_id: group_id, text: "👑 Host, quando quiser começar a Rodada 1, envie:\n,continuar", delay_seconds: 2 }));
  }

  return actions;
}

function shouldBlockStart(room) {
  const total = room.players_order.length;
  if (room.mode === "EAY" && total < 3) return "⚠️ No modo EAY, é necessário no mínimo 3 jogadores na sala para iniciar.";
  if (total < 2) return "⚠️ É necessário pelo menos 2 jogadores na sala para iniciar.";
  return null;
}

function buildQuestion({ room, rng }) {
  const types = room.question_types || { classica: true, vhs: true, manchete: true, instrucao: true };
  const candidates = [];
  if (types.classica) candidates.push("classica");
  if (types.vhs) candidates.push("vhs");
  if (types.manchete) candidates.push("manchete");
  if (types.instrucao) candidates.push("instrucao");
  const chosenType = candidates[Math.floor(rng() * candidates.length)] || "classica";

  return {
    question_type: chosenType,
    question_text: "_AI_PENDING_",
    truth_text: "_AI_PENDING_",
  };
}

function startRoundClassic({ state, room, requester_chat_id, message }) {
  const rng = makeRng(`${room.code}|classic|round${room.game.round_index + 1}|${Date.now()}|${Math.random()}`);
  const q = buildQuestion({ room, rng });

  room.game.phase = "COLLECTING";
  room.game.mode_runtime = "CLASSIC";
  room.game.round_index += 1;
  room.status = "IN_GAME";
  room.game.round = {
    mode: "CLASSIC",
    question_type: q.question_type,
    question_text: q.question_text,
    truth_text: q.truth_text,
    submissions: {},
    bots_submitted: false,
    options: null,
    votes: {},
    reveal: null,
  };

  const actions = [];
  const group_id = room.screen_group_id;

  const aiQ = actionAiJob(
    {
      reason: "GENERATE_QUESTION",
      scene: "generate_question",
      sala_id: room.code,
      round: room.game.round_index,
      mode: "CLASSIC",
      question_type: q.question_type,
      target: {
        state_path: `rooms.${room.code}.game.round`,
        fields: ["question_text", "truth_text"],
      },
    },
    state,
    message,
  );
  if (aiQ) actions.push(aiQ);

  actions.push(
    actionSend({
      channel: "group",
      chat_id: group_id,
      text: [
        "━━━━━━━━━━━━━━━",
        `🎲 RODADA ${room.game.round_index}`,
        "Modo: Clássico",
        "",
        "📜 Aguarde... Preparando pergunta... 🎲",
        "",
        "✍️ Em breve vocês poderão enviar mentiras no privado.",
      ].join("\n"),
    }),
  );

  for (const pid of room.players_order) {
    const p = room.players[pid];
    if (!p || p.is_bot) continue;
    actions.push(
      actionSend({
        channel: "private",
        chat_id: pid,
        text: [
          `📝 RODADA ${room.game.round_index}`,
          "",
          "⏳ Aguardando pergunta...",
          "",
          "(A pergunta aparecerá em instantes)",
        ].join("\n"),
      }),
    );
  }

  const botIds = room.players_order.filter((pid) => room.players[pid]?.is_bot);
  for (const bid of botIds) {
    const botName = room.players[bid]?.name ?? `Bot_${bid}`;
    room.game.round.submissions[bid] = `[aguardando IA para ${botName}...]`;

    const aiLie = actionAiJob(
      {
        reason: "GENERATE_LIE",
        scene: "generate_lie",
        sala_id: room.code,
        round: room.game.round_index,
        mode: "CLASSIC",
        question_type: q.question_type,
        bot_id: bid,
        bot_name: botName,
        target: {
          state_path: `rooms.${room.code}.game.round.submissions.${bid}`,
        },
      },
      state,
      message,
    );
    if (aiLie) actions.push(aiLie);
  }

  room.game.round.bots_submitted = true;

  actions.push(
    actionSend({
      channel: "group",
      chat_id: group_id,
      text: [
        "✍️ Status das respostas:",
        ...room.players_order.map((pid) => {
          const p = room.players[pid];
          const isBot = p?.is_bot;
          const ok = !!room.game.round.submissions[pid];
          return `${ok ? "🤖" : "⏳"} ${p?.name ?? pid}${isBot ? " (bot)" : ""}`;
        }),
      ].join("\n"),
      delay_seconds: 1,
    }),
  );

  return actions;
}

function startRoundEAY({ state, room, requester_chat_id, message }) {
  const rng = makeRng(`${room.code}|eay|round${room.game.round_index + 1}|${Date.now()}|${Math.random()}`);
  const q = buildQuestion({ room, rng });

  room.game.phase = "COLLECTING";
  room.game.mode_runtime = "EAY";
  room.game.round_index += 1;
  room.status = "IN_GAME";

  const humanIds = room.players_order.filter((pid) => !room.players[pid]?.is_bot);
  let chosen = null;
  if (!room.game.last_chosen_id) {
    chosen = humanIds[Math.floor(rng() * humanIds.length)] || room.host_chat_id;
  } else {
    const idx = Math.max(0, humanIds.indexOf(room.game.last_chosen_id));
    chosen = humanIds[(idx + 1) % humanIds.length] || room.host_chat_id;
  }
  room.game.last_chosen_id = chosen;

  room.game.round = {
    mode: "EAY",
    question_type: q.question_type,
    question_text: q.question_text,
    chosen_chat_id: chosen,
    true_answer: null,
    lies: {},
    votes_truth: {},
    chosen_fav_vote: null,
    options: null,
    reveal: null,
  };

  const actions = [];
  const group_id = room.screen_group_id;
  const chosenName = room.players[chosen]?.name ?? "Escolhido";

  const aiQ = actionAiJob(
    {
      reason: "GENERATE_QUESTION",
      scene: "generate_question",
      sala_id: room.code,
      round: room.game.round_index,
      mode: "EAY",
      question_type: q.question_type,
      chosen_player: {
        chat_id: chosen,
        name: chosenName,
      },
      target: {
        state_path: `rooms.${room.code}.game.round`,
        fields: ["question_text"],
      },
    },
    state,
    message,
  );
  if (aiQ) actions.push(aiQ);

  actions.push(
    actionSend({
      channel: "group",
      chat_id: group_id,
      text: [
        "━━━━━━━━━━━━━━━",
        `🎲 RODADA ${room.game.round_index} — MODO EAY`,
        "━━━━━━━━━━━━━━━",
        `✨ Jogador escolhido: ${chosenName} ✨`,
        "",
        "📜 Aguarde... Preparando pergunta sobre o escolhido... 🎲",
        "",
        "✍️ Em breve começaremos a coleta!",
      ].join("\n"),
    }),
  );

  actions.push(
    actionSend({
      channel: "private",
      chat_id: chosen,
      text: [
        `📝 RODADA ${room.game.round_index} (EAY)`,
        "",
        "✨ Você é o escolhido desta rodada!",
        "",
        "⏳ Aguardando pergunta sobre você...",
        "",
        "(Em instantes você receberá a pergunta e deverá responder com a VERDADE)",
      ].join("\n"),
    }),
  );

  for (const pid of room.players_order) {
    if (pid === chosen) continue;
    const p = room.players[pid];
    if (!p || p.is_bot) continue;
    actions.push(
      actionSend({
        channel: "private",
        chat_id: pid,
        text: [
          `🕵️‍♂️ ${chosenName} é o escolhido!`,
          "",
          "⏳ Aguardando pergunta...",
          "",
          "(Em instantes você deverá INVENTAR o que acha que ele responderia)",
        ].join("\n"),
      }),
    );
  }

  const botIds = room.players_order.filter((pid) => room.players[pid]?.is_bot && pid !== chosen);
  for (const bid of botIds) {
    const botName = room.players[bid]?.name ?? `Bot_${bid}`;
    room.game.round.lies[bid] = `[aguardando IA para ${botName}...]`;

    const aiLie = actionAiJob(
      {
        reason: "GENERATE_LIE",
        scene: "generate_lie",
        sala_id: room.code,
        round: room.game.round_index,
        mode: "EAY",
        question_type: q.question_type,
        bot_id: bid,
        bot_name: botName,
        chosen_player: {
          chat_id: chosen,
          name: chosenName,
        },
        target: {
          state_path: `rooms.${room.code}.game.round.lies.${bid}`,
        },
      },
      state,
      message,
    );
    if (aiLie) actions.push(aiLie);
  }

  return actions;
}

function allHumansSubmittedClassic(room) {
  const round = room.game.round;
  for (const pid of room.players_order) {
    const p = room.players[pid];
    if (!p || p.is_bot) continue;
    if (!round.submissions[pid]) return false;
  }
  return true;
}

function allNeededSubmittedEAY(room) {
  const round = room.game.round;
  if (!round.true_answer) return false;
  for (const pid of room.players_order) {
    if (pid === round.chosen_chat_id) continue;
    const p = room.players[pid];
    if (!p || p.is_bot) continue;
    if (!round.lies[pid]) return false;
  }
  return true;
}

function buildVotingOptionsClassic(room) {
  const round = room.game.round;
  const truth = { owner: "_TRUTH_", text: normalizeAnswerText(round.truth_text), is_truth: true };

  const optionsRaw = [truth];
  for (const pid of room.players_order) {
    const ans = round.submissions[pid];
    if (!ans) continue;
    optionsRaw.push({ owner: pid, text: normalizeAnswerText(ans), is_truth: false });
  }

  const seen = new Set();
  const dedup = [];
  for (const o of optionsRaw) {
    const k = o.text;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    dedup.push(o);
  }

  const rng = makeRng(`${room.code}|vote|classic|r${room.game.round_index}|${Date.now()}|${Math.random()}`);
  fisherYatesShuffle(dedup, rng);

  const letters = lettersFor(dedup.length);
  const options = dedup.map((o, i) => ({ letter: letters[i], ...o }));
  round.options = options;
  return options;
}

function buildVotingOptionsEAY(room) {
  const round = room.game.round;
  const truth = { owner: round.chosen_chat_id, text: normalizeAnswerText(round.true_answer), is_truth: true };

  const optionsRaw = [truth];
  for (const pid of room.players_order) {
    if (pid === round.chosen_chat_id) continue;
    const lie = round.lies[pid];
    if (!lie) continue;
    optionsRaw.push({ owner: pid, text: normalizeAnswerText(lie), is_truth: false });
  }

  const seen = new Set();
  const dedup = [];
  for (const o of optionsRaw) {
    const k = o.text;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    dedup.push(o);
  }

  const rng = makeRng(`${room.code}|vote|eay|r${room.game.round_index}|${Date.now()}|${Math.random()}`);
  fisherYatesShuffle(dedup, rng);

  const letters = lettersFor(dedup.length);
  const options = dedup.map((o, i) => ({ letter: letters[i], ...o }));
  round.options = options;
  return options;
}

function votingText(room) {
  const round = room.game.round;
  const opts = round.options || [];
  const lines = [];
  lines.push("🗳️ HORA DE VOTAR");
  lines.push("");
  lines.push(`Pergunta:\n"${round.question_text}"`);
  lines.push("");
  for (const o of opts) lines.push(`${o.letter}) ${o.text}`);
  lines.push("");

  if (round.mode === "EAY") {
    const chosenName = room.players[round.chosen_chat_id]?.name ?? "Escolhido";
    lines.push("👥 Todos votam no que acham que é a resposta verdadeira.");
    lines.push(`👤 Escolhido (${chosenName}): você vota na mentira que mais gostou ⭐`);
  } else {
    lines.push("(Envie apenas a letra no privado)");
  }

  return lines.join("\n");
}

function computeRevealClassic(room) {
  const round = room.game.round;
  const options = round.options || [];
  const truth = options.find((o) => o.is_truth);
  const truthLetter = truth?.letter ?? null;

  const votes = deepClone(round.votes || {});
  const whoVotedFor = {};
  for (const [voter, letter] of Object.entries(votes)) {
    if (!whoVotedFor[letter]) whoVotedFor[letter] = [];
    whoVotedFor[letter].push(voter);
  }

  const fooled = [];
  for (const o of options) {
    if (o.is_truth) continue;
    const voters = whoVotedFor[o.letter] || [];
    for (const v of voters) fooled.push({ liar_owner: o.owner, fooled_voter: v, letter: o.letter, text: o.text });
  }

  const correct = (whoVotedFor[truthLetter] || []).slice();
  const score_cfg = room.game.score_cfg || { points_correct: 1000, points_fooled: 1000 };

  for (const v of correct) room.game.scores[v] = (room.game.scores[v] ?? 0) + score_cfg.points_correct;
  for (const f of fooled) {
    if (f.liar_owner && f.liar_owner !== "_TRUTH_") room.game.scores[f.liar_owner] = (room.game.scores[f.liar_owner] ?? 0) + score_cfg.points_fooled;
  }

  const scoreboard = room.players_order
    .map((pid) => ({ pid, name: room.players[pid]?.name ?? pid, score: room.game.scores[pid] ?? 0, is_bot: !!room.players[pid]?.is_bot }))
    .sort((a, b) => b.score - a.score);

  const reveal = {
    mode: "CLASSIC",
    truth: { letter: truthLetter, text: truth?.text ?? "" },
    votes,
    fooled,
    correct,
    scoreboard,
  };

  round.reveal = reveal;
  return reveal;
}

function computeRevealEAY(room) {
  const round = room.game.round;
  const options = round.options || [];
  const truth = options.find((o) => o.is_truth);
  const truthLetter = truth?.letter ?? null;

  const votes_truth = deepClone(round.votes_truth || {});
  const chosen_fav = round.chosen_fav_vote;

  const whoVotedFor = {};
  for (const [voter, letter] of Object.entries(votes_truth)) {
    if (!whoVotedFor[letter]) whoVotedFor[letter] = [];
    whoVotedFor[letter].push(voter);
  }

  const fooled = [];
  for (const o of options) {
    if (o.is_truth) continue;
    const voters = whoVotedFor[o.letter] || [];
    for (const v of voters) fooled.push({ liar_owner: o.owner, fooled_voter: v, letter: o.letter, text: o.text });
  }

  const correct = (whoVotedFor[truthLetter] || []).slice();
  const score_cfg = room.game.score_cfg || { points_correct: 1000, points_fooled: 1000, points_chosen_fav_bonus: 100 };

  for (const v of correct) room.game.scores[v] = (room.game.scores[v] ?? 0) + score_cfg.points_correct;
  for (const f of fooled) room.game.scores[f.liar_owner] = (room.game.scores[f.liar_owner] ?? 0) + score_cfg.points_fooled;

  let chosenFavOwner = null;
  if (chosen_fav) {
    const opt = options.find((o) => o.letter === chosen_fav);
    if (opt && !opt.is_truth) {
      chosenFavOwner = opt.owner;
      room.game.scores[chosenFavOwner] = (room.game.scores[chosenFavOwner] ?? 0) + score_cfg.points_chosen_fav_bonus;
    }
  }

  const scoreboard = room.players_order
    .map((pid) => ({ pid, name: room.players[pid]?.name ?? pid, score: room.game.scores[pid] ?? 0, is_bot: !!room.players[pid]?.is_bot }))
    .sort((a, b) => b.score - a.score);

  const reveal = {
    mode: "EAY",
    chosen_chat_id: round.chosen_chat_id,
    chosen_fav_vote: chosen_fav,
    chosen_fav_owner: chosenFavOwner,
    truth: { letter: truthLetter, text: truth?.text ?? "" },
    votes_truth,
    fooled,
    correct,
    scoreboard,
  };

  round.reveal = reveal;
  return reveal;
}

function callAiReveal({ room, message, state }) {
  const r = room.game.round;
  const payload = {
    reason: "NARRATE_REVEAL",
    scene: "reveal",
    sala_id: room.code,
    fase: "REVEAL",
    round: room.game.round_index,
    mode: room.mode,
    question_type: r.question_type,
    question_text: r.question_text,
    reveal: r.reveal,
    host_chat_id: room.host_chat_id,
    screen_group_id: room.screen_group_id,
    players: room.players_order.map((pid) => ({
      chat_id: pid,
      name: room.players[pid]?.name ?? pid,
      is_bot: !!room.players[pid]?.is_bot,
      score: room.game.scores[pid] ?? 0,
    })),
    sender_chat_id: message.sender_chat_id,
    sender_name: message.sender_name,
    last_message_text: message.text,
    status_json: deepClone(state.user_context[message.sender_chat_id] || {}),
    estado_json_raw: deepClone(room),
    datastore_text: "",
    context_all_text: "",
  };

  return actionAiJob(payload, state, message);
}

function afterBigEventPause(room) {
  room.game.phase = "WAITING_HOST_CONTINUE";
  room.game.waiting_reason = "BIG_EVENT";
  room.game.last_big_event = Date.now();
}

function isHostContinueCmd({ parsed, room }) {
  if (!room) return false;
  if (parsed.kind === "GROUP_CMD") {
    const c = parseCommandGroup(parsed.cmd);
    return c.cmd === "continuar" && isHost(room, parsed.sender_chat_id);
  }
  if (parsed.kind === "PRIVATE_TEXT") {
    const c = parseCommandPrivate(parsed.text);
    return c.cmd === "continuar" && isHost(room, parsed.sender_chat_id);
  }
  return false;
}

function showFinalResults({ room, actions }) {
  room.game.phase = "GAME_END";
  room.status = "ENDED";

  const scoreboard = room.players_order
    .map((pid) => ({ pid, name: room.players[pid]?.name ?? pid, score: room.game.scores[pid] ?? 0, is_bot: !!room.players[pid]?.is_bot }))
    .sort((a, b) => b.score - a.score);

  const winner = scoreboard[0];
  const podium = scoreboard.slice(0, 3).map((p, idx) => {
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
    return `${medal} ${p.name}${p.is_bot ? " 🤖" : ""} — ${p.score} pts`;
  });
  const allScores = scoreboard.map((p, idx) => `${idx + 1}º ${p.name}${p.is_bot ? " 🤖" : ""} — ${p.score} pts`);

  if (room.screen_group_id) {
    actions.push(
      actionSend({
        channel: "group",
        chat_id: room.screen_group_id,
        text: [
          "🎉🎉🎉 FIM DE JOGO 🎉🎉🎉",
          "",
          "━━━━━━━━━━━━━━━",
          "🏆 PÓDIO",
          "",
          ...podium,
          "",
          "━━━━━━━━━━━━━━━",
          "📊 PLACAR FINAL",
          "",
          ...allScores,
          "",
          "━━━━━━━━━━━━━━━",
          `👑 VENCEDOR: ${winner.name}${winner.is_bot ? " 🤖" : ""}`,
          `⭐ ${winner.score} pontos`,
          "",
          "Obrigado por jogar! 🎲✨",
        ].join("\n"),
      }),
    );
  }

  actions.push(
    actionSend({
      channel: "private",
      chat_id: room.host_chat_id,
      text: [
        "🎉 Partida encerrada!",
        "",
        `🏆 Vencedor: ${winner.name}${winner.is_bot ? " 🤖" : ""}`,
        `⭐ ${winner.score} pontos`,
        "",
        "A sala foi encerrada automaticamente.",
        "Obrigado por jogar! 🎲",
      ].join("\n"),
    }),
  );
}

function ensureScoreCfg(room) {
  if (!room.game.score_cfg) {
    room.game.score_cfg = {
      points_correct: 1000,
      points_fooled: 1000,
      points_chosen_fav_bonus: 100,
    };
  }
}

function normalizeInputAggregate(rawInput) {
  const wrapper = Array.isArray(rawInput) ? rawInput[0] : rawInput;
  const dataArr = wrapper?.data;
  if (!Array.isArray(dataArr) || dataArr.length < 3) return { msg: null, st: null, tag: null };

  const ctx = dataArr[0] || {};
  const sender = dataArr[1] || {};
  const webhook = dataArr[2] || {};

  const norm = (v) => (typeof v === "string" ? v.trim() : "");

  const rawText = sender?.text ?? ctx?.last_message_text ?? ctx?.client_last_message_text ?? webhook?.body?.Payload?.Content?.LastMessage?.Content ?? "";
  const text = norm(rawText);

  const isGroup = (() => {
    const gi = webhook?.body?.Payload?.Content?.Contact?.GroupIdentifier ?? webhook?.body?.Payload?.Content?.GroupIdentifier ?? null;
    if (gi) return true;
    const ct = webhook?.body?.Payload?.Content?.Contact?.ContactType;
    if (ct && ct !== "DirectMessage") return true;
    return false;
  })();

  const chatId =
    sender?.chat_id ??
    sender?.sender_chat_id ??
    webhook?.body?.Payload?.Content?.Id ??
    webhook?.body?.Payload?.Content?.LastMessage?.Chat?.Id ??
    webhook?.body?.Payload?.Content?.Contact?.Id ??
    "UNKNOWN";

  const senderChatId = sender?.sender_chat_id ?? webhook?.body?.Payload?.Content?.LastMessage?.FromContact?.Id ?? chatId;
  const senderName = sender?.sender_name ?? webhook?.body?.Payload?.Content?.Contact?.Name ?? ctx?.sender_name ?? "Jogador";

  const msg = {
    chat_type: isGroup ? "group" : "private",
    chat_id: String(chatId),
    sender_chat_id: String(senderChatId),
    sender_name: String(senderName),
    text,
  };

  const st = wrapper?.state || ctx?.state || null;
  return { msg, st, tag: "aggregate_data", aggregate_ctx: ctx, aggregate_sender: sender };
}

function hydrateStateFromAggregateContext(state, compat) {
  const s = ensureStateBase(state || {});
  const ctx = compat?.aggregate_ctx || {};
  const sender = compat?.aggregate_sender || {};

  const normalizePromptText = (rawText) =>
    String(rawText ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const detectStepFromText = (rawText) => {
    const txt = normalizePromptText(rawText);
    if (!txt) return null;
    const markers = [
      { step: "SET_NAME", needle: "alterar nome" },
      { step: "SET_NAME", needle: "digite o novo nome" },
      { step: "ROOM_CREATE_NAME", needle: "passo 1/5" },
      { step: "ROOM_CREATE_NAME", needle: "nome da sala" },
      { step: "ROOM_CREATE_VISIBILITY", needle: "passo 2/5" },
      { step: "ROOM_CREATE_VISIBILITY", needle: "visibilidade" },
      { step: "ROOM_CREATE_PASSWORD", needle: "passo 3/5" },
      { step: "ROOM_CREATE_PASSWORD", needle: "definir senha" },
      { step: "ROOM_CREATE_MODE", needle: "passo 4/5" },
      { step: "ROOM_CREATE_MODE", needle: "modo de jogo" },
      { step: "ROOM_CREATE_ROUNDS", needle: "passo 5/5" },
      { step: "ROOM_CREATE_ROUNDS", needle: "numero de rodadas" },
      { step: "ENTER_PASSWORD", needle: "esta sala exige senha" },
      { step: "ENTER_PASSWORD", needle: "digite a senha" },
      { step: "ASK_TUTORIAL", needle: "deseja exibir um breve tutorial" },
      { step: "BOT_ACCESS", needle: "menu – lobby" },
      { step: "BOT_ACCESS", needle: "o que voce quer fazer" },
      { step: "BOT_ACCESS", needle: "menu principal" },
    ];

    let best = null;
    for (const m of markers) {
      const i = txt.lastIndexOf(m.needle);
      if (i < 0) continue;
      if (!best || i > best.index) best = { step: m.step, index: i };
    }
    return best?.step ?? null;
  };

  const inferStepFromLastCompanyPrompt = () => {
    const all = Array.isArray(ctx?.context_all) ? ctx.context_all : [];
    const isCompanyRole = (r) => {
      const rr = String(r ?? "").toLowerCase();
      return rr === "company" || rr === "ia" || rr === "equipe" || rr === "assistant";
    };

    // Prioriza o último prompt da empresa imediatamente anterior à última mensagem do cliente.
    if (all.length) {
      let seenClient = false;
      let checkedPreviousCompanyPrompt = false;
      for (const e of [...all].reverse()) {
        const role = String(e?.role ?? "").toLowerCase();
        if (!seenClient && role === "client") {
          seenClient = true;
          continue;
        }
        if (!seenClient) continue;
        if (!isCompanyRole(role) || !e?.text) continue;
        checkedPreviousCompanyPrompt = true;
        const step = detectStepFromText(e.text);
        if (step) return step;
        // Se o prompt imediatamente anterior não indica etapa, não volta para prompts antigos.
        break;
      }
      if (checkedPreviousCompanyPrompt) return null;
    }

    // fallback: procura a última mensagem da empresa que indique passo
    // (usado apenas quando não há âncora client->company no contexto)
    for (const e of [...all].reverse()) {
      if (!isCompanyRole(e?.role) || !e?.text) continue;
      const step = detectStepFromText(e.text);
      if (step) return step;
    }

    // fallback para pipelines que só entregam context_all_text (transcript único)
    const stepFromTranscript = detectStepFromText(ctx?.context_all_text);
    if (stepFromTranscript) return stepFromTranscript;

    return null;
  };

  const normalizeStepName = (stepRaw) => {
    const step = String(stepRaw ?? "").trim();
    if (!step) return "";
    const map = {
      LOBBY_MENU: "BOT_ACCESS",
      LOBBY: "BOT_ACCESS",
      CREATE_STEP_NAME: "ROOM_CREATE_NAME",
      CREATE_STEP_VIS: "ROOM_CREATE_VISIBILITY",
      CREATE_STEP_PASS: "ROOM_CREATE_PASSWORD",
      CREATE_STEP_MODE: "ROOM_CREATE_MODE",
      CREATE_STEP_ROUNDS: "ROOM_CREATE_ROUNDS",
      ROOM_START_TUTORIAL_Q: "ASK_TUTORIAL",
      WAITING_VINC: "ROOM_CREATE_WAIT_VINC",
    };
    return map[step] || step;
  };

  const senderId = String(sender?.sender_chat_id ?? ctx?.sender_chat_id ?? "").trim();
  if (!senderId) return s;

  const hydrateRoomFromAggregateRow = (row) => {
    if (!row || typeof row !== "object") return;
    let roomObj = null;
    const rawEstado = row?.estado_json_raw ?? row?.estado_json ?? row?.estado_obj ?? null;
    try {
      if (typeof rawEstado === "string" && rawEstado.trim()) roomObj = JSON.parse(rawEstado);
      else if (rawEstado && typeof rawEstado === "object") roomObj = deepClone(rawEstado);
    } catch (e) {
      roomObj = null;
    }

    const roomCode = String(roomObj?.code ?? roomObj?.sala_id ?? row?.sala_id ?? "").trim();
    if (!roomCode || roomCode === "BOT_ACCESS") return;

    const existing = s.rooms[roomCode] || {};
    const merged = {
      ...existing,
      ...(roomObj && typeof roomObj === "object" ? roomObj : {}),
      code: roomCode,
      name: roomObj?.name ?? roomObj?.sala_nome ?? row?.nome ?? existing?.name ?? null,
      visibility: roomObj?.visibility ?? roomObj?.visibilidade ?? row?.visibilidade ?? existing?.visibility ?? null,
      password: roomObj?.password ?? roomObj?.senha ?? row?.senha ?? existing?.password ?? null,
      max_players: Number(roomObj?.max_players ?? roomObj?.max_jogadores ?? row?.max_jogadores ?? existing?.max_players ?? 8) || 8,
      rounds_total: Number(roomObj?.rounds_total ?? roomObj?.rodadas_total ?? row?.rodadas_total ?? existing?.rounds_total ?? 5) || 5,
      host_chat_id: String(roomObj?.host_chat_id ?? row?.host_chat_id ?? existing?.host_chat_id ?? "").trim() || null,
      status: roomObj?.status ?? existing?.status ?? "IN_ROOM",
      players: (roomObj?.players && typeof roomObj.players === "object") ? roomObj.players : (existing?.players || {}),
      players_order: Array.isArray(roomObj?.players_order) ? roomObj.players_order : (existing?.players_order || []),
      game: (roomObj?.game && typeof roomObj.game === "object") ? roomObj.game : (existing?.game || { phase: "WAITING", round_index: 0, scores: {}, round: null }),
    };

    if (merged.host_chat_id && !merged.players[merged.host_chat_id]) {
      merged.players[merged.host_chat_id] = {
        chat_id: merged.host_chat_id,
        name: merged.host_chat_id === senderId ? (s.users[senderId]?.name || "Jogador") : "Host",
        is_bot: false,
      };
    }
    if (merged.host_chat_id && !merged.players_order.includes(merged.host_chat_id)) {
      merged.players_order = [merged.host_chat_id, ...merged.players_order.filter((x) => x !== merged.host_chat_id)];
    }

    s.rooms[roomCode] = merged;
  };

  // Hidrata rooms pelo aggregate para não perder passos entre execuções sem raw.state.
  const salaRows = [
    ...(Array.isArray(ctx?.datastore?.salas) ? ctx.datastore.salas : []),
    ...(Array.isArray(ctx?.salas_rows) ? ctx.salas_rows : []),
  ];
  for (const r of salaRows) hydrateRoomFromAggregateRow(r);
  if (ctx?.datastore?.sala && typeof ctx.datastore.sala === "object") hydrateRoomFromAggregateRow(ctx.datastore.sala);
  if (ctx?.sala_row && typeof ctx.sala_row === "object") hydrateRoomFromAggregateRow(ctx.sala_row);

  const nome = String(sender?.sender_name ?? ctx?.sender_name ?? ctx?.nome ?? "Jogador").trim() || "Jogador";

  if (!s.users[senderId]) s.users[senderId] = { name: nome, created_at: Date.now() };
  s.users[senderId].name = s.users[senderId].name || nome;
  s.users[senderId].last_seen_name = nome;

  let parsedStatus = null;
  try {
    const rawStatus = ctx?.status_json;
    if (typeof rawStatus === "string" && rawStatus.trim()) parsedStatus = JSON.parse(rawStatus);
    else if (rawStatus && typeof rawStatus === "object") parsedStatus = rawStatus;
  } catch (e) {
    parsedStatus = null;
  }

  const hasParticipantInAggregate = (() => {
    const parts =
      (Array.isArray(ctx?.datastore?.participantes) ? ctx.datastore.participantes : null) ??
      (Array.isArray(ctx?.participantes_rows) ? ctx.participantes_rows : null) ??
      [];
    return parts.some((p) => String(p?.chat_id ?? "") === String(senderId));
  })();

  const inferredStep = (() => {
    const fromStatus = normalizeStepName(parsedStatus?.context?.step);
    if (fromStatus) return fromStatus;
    const fromFlatStatus = String(ctx?.status ?? "").trim().toLowerCase();
    if (fromFlatStatus === "ativo") return "BOT_ACCESS";
    if (fromFlatStatus === "inativo") return "BOT_INACTIVE";
    // Sem status e sem participante persistido => trate como inativo até ativar.
    if (!hasParticipantInAggregate) return "BOT_INACTIVE";
    return "BOT_ACCESS";
  })();

  const inferredRoom =
    String(parsedStatus?.context?.current_room_code ?? "").trim() ||
    String(ctx?.sala_id ?? "").trim();

  const existingCtx = s.user_context[senderId] || {};
  s.user_context[senderId] = {
    step: existingCtx.step || inferredStep,
    current_room_code:
      existingCtx.current_room_code != null
        ? existingCtx.current_room_code
        : inferredRoom && inferredRoom !== "BOT_ACCESS"
          ? inferredRoom
          : null,
    draft: existingCtx.draft ?? null,
    ...existingCtx,
    ...(parsedStatus?.context && typeof parsedStatus.context === "object" ? parsedStatus.context : {}),
  };

  // Se veio contexto explícito ativo/inativo no payload de datastore, ele prevalece.
  if (ctx?.status === "ativo") s.user_context[senderId].step = "BOT_ACCESS";
  if (ctx?.status === "inativo") s.user_context[senderId].step = "BOT_INACTIVE";

  // Se o datastore ainda não refletiu o último step, tenta inferir pelo último prompt da empresa.
  // Não sobrescreve BOT_INACTIVE inferido por ausência de participante no aggregate.
  const fromFlatStatusNorm = String(ctx?.status ?? "").trim().toLowerCase();
  const canApplyHint = !(inferredStep === "BOT_INACTIVE" && !hasParticipantInAggregate) && fromFlatStatusNorm !== "inativo";
  if (canApplyHint) {
    const hintedStep = inferStepFromLastCompanyPrompt();
    if (hintedStep) s.user_context[senderId].step = hintedStep;
  }

  s.user_context[senderId].step = normalizeStepName(s.user_context[senderId].step);

  return s;
}

const input = $input.all();
const raw = input[0]?.json ?? {};
const compat = normalizeInputAggregate(raw);
const message = deepClone(raw.message || compat.msg || {});
let state = ensureStateBase(raw.state || compat.st || {});
state = hydrateStateFromAggregateContext(state, compat);
const actions = [];

const sender_chat_id = String(message.sender_chat_id ?? "");
const sender_name = String(message.sender_name ?? "Jogador");
const chat_type = message.chat_type;
const chat_id = String(message.chat_id ?? "");
const textRaw = String(message.text ?? "").trim();

if (!sender_chat_id || !chat_id || !chat_type) {
  return buildOutput(state, [], { error: "missing message fields", got: message }, message);
}

const profile = getUserProfile(state, sender_chat_id, sender_name);
const uctx = getUserCtx(state, sender_chat_id);
const parsed = parseIncoming(message, state);

uctx.last_seen_at = Date.now();
uctx.last_seen_chat_type = String(chat_type || "");
uctx.last_message_preview = textRaw.slice(0, 160);
uctx.last_message_len = textRaw.length;

function findUserRoomCode() {
  if (uctx.current_room_code && state.rooms[uctx.current_room_code]) return uctx.current_room_code;
  for (const [code, r] of Object.entries(state.rooms)) {
    if (r?.status !== "ENDED" && r?.players?.[sender_chat_id]) return code;
  }
  return null;
}

function getRoomByCode(code) {
  return state.rooms[code] || null;
}

function reconcileStepFromCreatingRoom() {
  const code = findUserRoomCode();
  const room = code ? getRoomByCode(code) : null;
  if (!room) return;
  if (room.status !== "CREATING") return;
  if (!isHost(room, sender_chat_id)) return;

  // Evita perder o passo quando o aggregate vem sem status_json recente.
  uctx.current_room_code = room.code;

  if (!room.name) {
    uctx.step = "ROOM_CREATE_NAME";
    return;
  }
  if (!room.visibility) {
    uctx.step = "ROOM_CREATE_VISIBILITY";
    return;
  }
  if ((room.visibility === "privada" || room.visibility === "oculta") && !room.password) {
    uctx.step = "ROOM_CREATE_PASSWORD";
    return;
  }
}

reconcileStepFromCreatingRoom();

if (parsed.kind === "IGNORED_GROUP") return buildOutput(state, [], { ignored_group: true }, message);

if (parsed.kind === "VINC") {
  const code = parsed.code;
  const room = getRoomByCode(code);
  if (!room) return buildOutput(state, [], { vinc: "room_not_found", code }, message);

  room.screen_group_id = parsed.chat_id;
  if (room.status === "CREATING") {
    room.status = "IN_ROOM";
    room.game.phase = "WAITING";
    room.game.mode_runtime = room.mode;
  }

  ensureScoreCfg(room);

  actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: "📺✨ TELÃO VINCULADO COM SUCESSO!\n\n" + roomPanelText(room) }));
  actions.push(
    actionSend({
      channel: "private",
      chat_id: room.host_chat_id,
      text: [
        "✅ Sala ativada e vinculada com sucesso!",
        "",
        `🎲 ${room.name}`,
        `🆔 Código: ${room.code}`,
        `🎮 Modo: ${room.mode === "EAY" ? "EAY (Enough About You)" : "Clássico"}`,
        room.visibility === "publica" ? "🔓 Pública" : room.visibility === "privada" ? "🔒 Privada (senha)" : "🙈 Oculta (senha)",
        `👥 Máx jogadores: ${room.max_players}`,
        `🔢 Rodadas: ${room.rounds_total}`,
        "⭐ Tipos ativos: Clássica, VHS, Manchete, Instruções",
        "",
        "⚙️ Para abrir as configurações da sala, digite:",
        "config",
        "",
        "Quando quiser iniciar a partida, digite:",
        "iniciar",
      ].join("\n"),
    }),
  );

  return buildOutput(state, actions, { vinc: "ok", code }, message);
}

if (parsed.kind === "GROUP_CMD") {
  const cmd = parseCommandGroup(parsed.cmd);
  const roomCode = findUserRoomCode();
  const room = roomCode ? getRoomByCode(roomCode) : null;

  if (!room || !room.screen_group_id || room.screen_group_id !== parsed.chat_id) return buildOutput(state, [], { group_cmd: "no_room_match", cmd }, message);
  if (!isHost(room, parsed.sender_chat_id)) return buildOutput(state, [], { group_cmd: "not_host_ignored", cmd }, message);

  ensureScoreCfg(room);

  if (cmd.cmd === "continuar") {
    if (room.game.phase !== "WAITING_HOST_CONTINUE" && room.game.phase !== "WAITING") return buildOutput(state, [], { group_continue: "not_waiting" }, message);

    if (room.status === "IN_GAME" && room.game.round_index >= room.rounds_total) {
      showFinalResults({ room, actions });
      return buildOutput(state, actions, { group_continue: "game_ended" }, message);
    }

    if (room.mode === "EAY") actions.push(...startRoundEAY({ state, room, requester_chat_id: parsed.sender_chat_id, message }));
    else actions.push(...startRoundClassic({ state, room, requester_chat_id: parsed.sender_chat_id, message }));

    return buildOutput(state, actions, { group_continue: "ok" }, message);
  }

  if (cmd.cmd === "iniciar") {
    if (room.status !== "IN_ROOM") return buildOutput(state, [], { group_iniciar: "not_in_room" }, message);

    const block = shouldBlockStart(room);
    if (block) {
      actions.push(actionSend({ channel: "private", chat_id: room.host_chat_id, text: block }));
      return buildOutput(state, actions, { group_iniciar: "blocked" }, message);
    }

    uctx.step = "ASK_TUTORIAL";
    uctx.current_room_code = room.code;

    actions.push(
      actionSend({
        channel: "private",
        chat_id: room.host_chat_id,
        text: `📘 Deseja exibir um breve tutorial do modo ${room.mode === "EAY" ? "EAY" : "Clássico"} no telão?\n\n1️⃣ Sim\n2️⃣ Não\n\nDigite o número 👇`,
      }),
    );
    return buildOutput(state, actions, { group_iniciar: "asked_tutorial" }, message);
  }

  return buildOutput(state, [], { group_cmd: "unknown_ignored", cmd }, message);
}

if (parsed.kind === "PRIVATE_TEXT") {
  let c = parseCommandPrivate(parsed.text);
  uctx.last_private_cmd = String(c?.cmd ?? "text");
  uctx.last_private_cmd_at = Date.now();

  // Durante passos que aguardam texto livre, não interpretar como comando de menu.
  const textInputSteps = new Set([
    "SET_NAME",
    "ROOM_CREATE_NAME",
    "ROOM_CREATE_PASSWORD",
    "ENTER_PASSWORD",
    "CONFIG_SET_PASSWORD",
  ]);
  if (textInputSteps.has(String(uctx.step ?? "")) && c.cmd !== "text") {
    c = { cmd: "text", text: String(parsed.text ?? "").trim() };
  }

  if (c.cmd === "text" && normalizeAnswerText(c.text) === ",ativarbot") {
    if (uctx.step !== "BOT_INACTIVE") {
      const activeRoomCode = findUserRoomCode();
      if (activeRoomCode) {
        uctx.current_room_code = activeRoomCode;
        uctx.step = "IN_ROOM";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "✅ O bot já está ativo para você. Continuando de onde parou na sala." }));
      } else {
        uctx.step = "BOT_ACCESS";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "✅ O bot já está ativo para você." }));
      }
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: lobbyMenuText(), delay_seconds: 0 }));
      return buildOutput(state, actions, { activated: "already_active" }, message);
    }

    uctx.step = "BOT_ACCESS";
    uctx.current_room_code = null;

    actions.push(
      actionSend({
        channel: "private",
        chat_id: sender_chat_id,
        text: [
          "🤖✨ Bot ativado com sucesso!",
          "",
          "Bem-vindo ao Servidor Oficial do Fibbage 🎉🎲",
          "Você está no Lobby — ainda não está em nenhuma sala.",
        ].join("\n"),
      }),
    );

    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: lobbyMenuText() }));
    return buildOutput(state, actions, { activated: true }, message);
  }

  if (c.cmd === "desativarbot" || (c.cmd === "text" && normalizeAnswerText(c.text) === ",desativarbot")) {
    uctx.step = "BOT_INACTIVE";
    uctx.current_room_code = null;
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🛑 Bot desativado. Para voltar a jogar, envie ,ativarbot." }));
    return buildOutput(state, actions, { deactivated: true }, message);
  }

  if (uctx.step === "BOT_INACTIVE") {
    actions.push(
      actionSend({
        channel: "private",
        chat_id: sender_chat_id,
        text: "🤖 O bot está desativado para você. Envie ,ativarbot para voltar ao Lobby.",
      }),
    );
    return buildOutput(state, actions, { inactive_ignored: true }, message);
  }

  if (c.cmd === "menu") {
    uctx.step = "BOT_ACCESS";
    uctx.current_room_code = null;
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: lobbyMenuText() }));
    return buildOutput(state, actions, { menu: true }, message);
  }

  if (c.cmd === "salas") {
    const activeRoomCode = findUserRoomCode();
    if (activeRoomCode) {
      uctx.step = "IN_ROOM";
      uctx.current_room_code = activeRoomCode;
    } else {
      uctx.step = "BOT_ACCESS";
      uctx.current_room_code = null;
    }
    uctx.last_action = "salas_listed";

    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: listRoomsText(state) }));
    return buildOutput(state, actions, { salas: true }, message);
  }

  if (c.cmd === "nome") {
    const inlineName = String(c.name ?? "").trim().slice(0, 20);
    if (inlineName) {
      profile.name = inlineName;
      uctx.step = "BOT_ACCESS";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Nome alterado com sucesso!\n\n🎭 Agora você é: ${inlineName}` }));
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: lobbyMenuText(), delay_seconds: 0 }));
      return buildOutput(state, actions, { set_name: "ok_inline" }, message);
    }

    uctx.step = "SET_NAME";
    actions.push(
      actionSend({
        channel: "private",
        chat_id: sender_chat_id,
        text: `🪪 ALTERAR NOME\n\nSeu nome atual é:\n${profile.name}\n\nDigite o novo nome que deseja usar 👇\n\n(Máximo 20 caracteres)`,
      }),
    );
    return buildOutput(state, actions, { set_name: "prompt" }, message);
  }

  if (uctx.step === "SET_NAME" && c.cmd === "text") {
    const newName = String(c.text ?? "").trim().slice(0, 20);
    if (!newName) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Nome inválido. Digite um nome com pelo menos 1 caractere." }));
      return buildOutput(state, actions, { set_name: "invalid" }, message);
    }
    profile.name = newName;
    uctx.step = "BOT_ACCESS";
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Nome alterado com sucesso!\n\n🎭 Agora você é: ${newName}` }));
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: lobbyMenuText(), delay_seconds: 0 }));
    return buildOutput(state, actions, { set_name: "ok" }, message);
  }

  if (c.cmd === "criar") {
    const code = allocateRoomCode(state);
    const room = createRoomSkeleton({ code, host_chat_id: sender_chat_id, host_name: profile.name });
    state.rooms[code] = room;
    uctx.current_room_code = code;
    uctx.step = "ROOM_CREATE_NAME";

    actions.push(
      actionSend({
        channel: "private",
        chat_id: sender_chat_id,
        text: [
          "🏗️ CRIAR NOVA SALA",
          "",
          "Vamos configurar sua sala passo a passo 👇",
          "",
          "━━━━━━━━━━━━━━━",
          "📝 Passo 1/5 — Nome da sala",
          "",
          "Digite o nome da sala 👇",
          "",
          "(Máximo 25 caracteres)",
        ].join("\n"),
      }),
    );

    return buildOutput(state, actions, { criar: "started", code }, message);
  }

  if (c.cmd === "entrar") {
    const code = c.code;
    const room = getRoomByCode(code);
    if (!room || room.status === "ENDED") {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Sala não encontrada." }));
      return buildOutput(state, actions, { entrar: "not_found", code }, message);
    }

    if (room.visibility === "oculta" || room.visibility === "privada") {
      uctx.step = "ENTER_PASSWORD";
      uctx.current_room_code = code;
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🔐 Esta sala exige senha.\n\nDigite a senha 👇" }));
      return buildOutput(state, actions, { entrar: "ask_password", code }, message);
    }

    if (!room.players[sender_chat_id] && room.players_order.length >= room.max_players) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Sala cheia no momento." }));
      return buildOutput(state, actions, { entrar: "room_full", code }, message);
    }

    ensureUserInRoom(state, sender_chat_id, code);
    uctx.step = "IN_ROOM";
    uctx.current_room_code = code;

    if (room.screen_group_id) {
      actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: `👤✨ ${profile.name} entrou na sala!` }));
      actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: roomPanelText(room), delay_seconds: 1 }));
      actions.push(actionSend({ channel: "private", chat_id: room.host_chat_id, text: `👥 Atualização da sala!\n\n${profile.name} entrou.\nOlhe no telão para o painel atualizado.` }));
    } else {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "✅ Você entrou na sala.\n\n⚠️ O telão ainda não foi vinculado. Aguarde o host vincular." }));
    }

    return buildOutput(state, actions, { entrar: "ok_public", code }, message);
  }

  if (uctx.step === "ENTER_PASSWORD" && c.cmd === "text") {
    const code = uctx.current_room_code;
    const room = getRoomByCode(code);
    if (!room) {
      uctx.step = "BOT_ACCESS";
      uctx.current_room_code = null;
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Sala não encontrada." }));
      return buildOutput(state, actions, { enter_password: "room_missing" }, message);
    }

    const pass = String(c.text ?? "").trim();
    if (pass !== String(room.password ?? "")) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Senha incorreta. Tente novamente 👇" }));
      return buildOutput(state, actions, { enter_password: "wrong" }, message);
    }

    if (!room.players[sender_chat_id] && room.players_order.length >= room.max_players) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Sala cheia no momento." }));
      return buildOutput(state, actions, { enter_password: "room_full", code }, message);
    }

    ensureUserInRoom(state, sender_chat_id, code);
    uctx.step = "IN_ROOM";
    uctx.current_room_code = code;

    if (room.screen_group_id) {
      actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: `👤✨ ${profile.name} entrou na sala!` }));
      actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: roomPanelText(room), delay_seconds: 1 }));
      actions.push(actionSend({ channel: "private", chat_id: room.host_chat_id, text: `👥 Atualização da sala!\n\n${profile.name} entrou.\nOlhe no telão para o painel atualizado.` }));
    } else {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "✅ Você entrou na sala.\n\n⚠️ O telão ainda não foi vinculado. Aguarde o host vincular." }));
    }

    return buildOutput(state, actions, { enter_password: "ok" }, message);
  }

  const roomCode = findUserRoomCode();
  const room = roomCode ? getRoomByCode(roomCode) : null;

  if (room && room.status === "CREATING" && isHost(room, sender_chat_id)) {
    if (uctx.step === "ROOM_CREATE_NAME" && c.cmd === "text") {
      room.name = String(c.text ?? "").trim().slice(0, 25);
      uctx.step = "ROOM_CREATE_VISIBILITY";
      actions.push(
        actionSend({
          channel: "private",
          chat_id: sender_chat_id,
          text: [
            `🎲 Nome definido: ${room.name}`,
            "",
            "━━━━━━━━━━━━━━━",
            "🔓 Passo 2/5 — Visibilidade",
            "",
            "1️⃣ Pública",
            "2️⃣ Privada (exige senha)",
            "3️⃣ Oculta (não aparece na lista e exige senha)",
            "",
            "Digite o número 👇",
          ].join("\n"),
        }),
      );
      return buildOutput(state, actions, { create_name: "ok" }, message);
    }

    if (uctx.step === "ROOM_CREATE_VISIBILITY") {
      let vNum = null;
      if (c.cmd === "number") vNum = c.n;
      if (c.cmd === "text") {
        const t = normalizeAnswerText(c.text);
        const map = { "1": 1, "2": 2, "3": 3, publica: 1, pública: 1, privada: 2, oculta: 3 };
        if (map[t] != null) vNum = map[t];
      }

      if (vNum == null || ![1, 2, 3].includes(vNum)) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Opção inválida. Digite 1, 2 ou 3 👇" }));
        return buildOutput(state, actions, { create_visibility: "invalid" }, message);
      }

      room.visibility = vNum === 1 ? "publica" : vNum === 2 ? "privada" : "oculta";

      if (room.visibility === "publica") {
        room.password = null;
        uctx.step = "ROOM_CREATE_MODE";
        actions.push(
          actionSend({
            channel: "private",
            chat_id: sender_chat_id,
            text: [
              "🔓 Sala definida como: Pública",
              "",
              "━━━━━━━━━━━━━━━",
              "🎮 Passo 3/5 — Modo de jogo",
              "",
              "1️⃣ Clássico",
              "2️⃣ EAY (Enough About You)",
              "",
              "Digite o número 👇",
            ].join("\n"),
          }),
        );
        return buildOutput(state, actions, { create_visibility: "public_ok" }, message);
      }

      uctx.step = "ROOM_CREATE_PASSWORD";
      actions.push(
        actionSend({
          channel: "private",
          chat_id: sender_chat_id,
          text: [
            room.visibility === "privada" ? "🔒 Sala definida como: Privada" : "🙈 Sala definida como: Oculta",
            "",
            "🔐 Como esta sala exige senha obrigatoriamente…",
            "",
            "━━━━━━━━━━━━━━━",
            "🔑 Passo 3/5 — Definir senha",
            "",
            "Digite a senha da sala 👇",
            "",
            "(Mínimo 4 caracteres)",
          ].join("\n"),
        }),
      );
      return buildOutput(state, actions, { create_visibility: "ask_password" }, message);
    }

    if (uctx.step === "ROOM_CREATE_PASSWORD" && c.cmd === "text") {
      const pass = String(c.text ?? "").trim();
      if (pass.length < 4) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Senha muito curta. Mínimo 4 caracteres 👇" }));
        return buildOutput(state, actions, { create_password: "too_short" }, message);
      }

      room.password = pass;
      uctx.step = "ROOM_CREATE_MODE";
      actions.push(
        actionSend({
          channel: "private",
          chat_id: sender_chat_id,
          text: [
            "🔐 Senha definida com sucesso.",
            "",
            "━━━━━━━━━━━━━━━",
            "🎮 Passo 4/5 — Modo de jogo",
            "",
            "1️⃣ Clássico",
            "2️⃣ EAY (Enough About You)",
            "",
            "Digite o número 👇",
          ].join("\n"),
        }),
      );
      return buildOutput(state, actions, { create_password: "ok" }, message);
    }

    if (uctx.step === "ROOM_CREATE_MODE" && c.cmd === "number") {
      if (![1, 2].includes(c.n)) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Opção inválida. Digite 1 ou 2 👇" }));
        return buildOutput(state, actions, { create_mode: "invalid" }, message);
      }

      room.mode = c.n === 2 ? "EAY" : "CLASSIC";
      uctx.step = "ROOM_CREATE_ROUNDS";
      actions.push(
        actionSend({
          channel: "private",
          chat_id: sender_chat_id,
          text: [
            `🎮 Modo definido: ${room.mode === "EAY" ? "EAY (Enough About You)" : "Clássico"}`,
            "",
            "━━━━━━━━━━━━━━━",
            "🔢 Passo 5/5 — Número de rodadas",
            "",
            "Digite um número entre 1 e 10 👇",
          ].join("\n"),
        }),
      );
      return buildOutput(state, actions, { create_mode: "ok" }, message);
    }

    if (uctx.step === "ROOM_CREATE_ROUNDS" && (c.cmd === "number" || c.cmd === "text")) {
      const n = c.cmd === "number" ? c.n : parseIntStrict(c.text);
      if (n === null || n < 1 || n > 10) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Valor inválido. Digite um número entre 1 e 10 👇" }));
        return buildOutput(state, actions, { create_rounds: "invalid" }, message);
      }

      room.rounds_total = n;
      uctx.step = "ROOM_CREATE_WAIT_VINC";
      actions.push(
        actionSend({
          channel: "private",
          chat_id: sender_chat_id,
          text: [
            `🔢 Número de rodadas definido: ${room.rounds_total}`,
            "",
            "━━━━━━━━━━━━━━━",
            "📡 ÚLTIMO PASSO — Vincular o Telão",
            "",
            "Agora vá até o grupo que será o telão da sala e envie:",
            "",
            `vinc ${room.code}`,
            "",
            "(Envie exatamente assim no grupo)",
            "",
            "Após a vinculação, a sala será ativada.",
            "Aguardando vinculação... 👀",
          ].join("\n"),
        }),
      );
      return buildOutput(state, actions, { create_rounds: "ok" }, message);
    }
  }

  if (room && room.status !== "ENDED") {
    ensureScoreCfg(room);

    if (c.cmd === "config") {
      if (!isHost(room, sender_chat_id)) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Apenas o host pode abrir as configurações da sala." }));
        return buildOutput(state, actions, { config: "not_host" }, message);
      }
      uctx.step = "ROOM_CONFIG_MENU";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room) }));
      return buildOutput(state, actions, { config: "menu" }, message);
    }

    if (c.cmd === "iniciar") {
      if (!isHost(room, sender_chat_id)) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Apenas o host pode iniciar a partida." }));
        return buildOutput(state, actions, { iniciar: "not_host" }, message);
      }
      if (room.status !== "IN_ROOM") {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ A sala ainda não está pronta para iniciar. Vincule o telão e finalize a configuração primeiro." }));
        return buildOutput(state, actions, { iniciar: "not_in_room" }, message);
      }

      const block = shouldBlockStart(room);
      if (block) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: block }));
        return buildOutput(state, actions, { iniciar: "blocked" }, message);
      }

      uctx.step = "ASK_TUTORIAL";
      actions.push(
        actionSend({
          channel: "private",
          chat_id: sender_chat_id,
          text: `📘 Deseja exibir um breve tutorial do modo ${room.mode === "EAY" ? "EAY" : "Clássico"} no telão?\n\n1️⃣ Sim\n2️⃣ Não\n\nDigite o número 👇`,
        }),
      );
      return buildOutput(state, actions, { iniciar: "ask_tutorial" }, message);
    }

    if (isHostContinueCmd({ parsed, room })) {
      if (room.game.phase !== "WAITING_HOST_CONTINUE" && room.game.phase !== "WAITING") {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⏳ Ainda não há evento pendente para continuar." }));
        return buildOutput(state, actions, { continue: "not_waiting" }, message);
      }

      if (room.status === "IN_GAME" && room.game.round_index >= room.rounds_total) {
        showFinalResults({ room, actions });
        return buildOutput(state, actions, { continue: "game_ended" }, message);
      }

      if (room.mode === "EAY") actions.push(...startRoundEAY({ state, room, requester_chat_id: sender_chat_id, message }));
      else actions.push(...startRoundClassic({ state, room, requester_chat_id: sender_chat_id, message }));
      return buildOutput(state, actions, { continue: "ok_start_round" }, message);
    }

    if (uctx.step === "ASK_TUTORIAL" && isHost(room, sender_chat_id) && c.cmd === "number") {
      if (![1, 2].includes(c.n)) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Digite 1 ou 2 👇" }));
        return buildOutput(state, actions, { tutorial: "invalid_choice" }, message);
      }

      const show = c.n === 1;
      if (show) actions.push(...startTutorialActions({ room, mode: room.mode === "EAY" ? "EAY" : "CLASSIC" }));
      afterBigEventPause(room);
      uctx.step = "IN_ROOM";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: show ? "Tutorial concluído.\n\nEnvie continuar para iniciar a partida." : "Sem tutorial.\n\nEnvie continuar para iniciar a partida." }));
      return buildOutput(state, actions, { tutorial: show ? "shown" : "skipped" }, message);
    }

    if (uctx.step === "ROOM_CONFIG_MENU" && isHost(room, sender_chat_id) && c.cmd === "number") {
      const n = c.n;

      if (n === 0) {
        uctx.step = "IN_ROOM";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🎲 PAINEL DA SALA\n\n" + roomPanelText(room) + "\n\n⚙️ Digite config para configurar\n🎬 Digite iniciar para começar" }));
        return buildOutput(state, actions, { config: "back_panel" }, message);
      }
      if (n === 1) {
        uctx.step = "CONFIG_ROUNDS";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `🔢 NÚMERO DE RODADAS\n\nAtual: ${room.rounds_total}\n\nDigite um número entre 1 e 10 👇` }));
        return buildOutput(state, actions, { config: "rounds_prompt" }, message);
      }
      if (n === 2) {
        uctx.step = "CONFIG_QTYPES";
        const qt = room.question_types;
        const line = (label, on) => `${label} — ${on ? "✅" : "❌"}`;
        actions.push(
          actionSend({
            channel: "private",
            chat_id: sender_chat_id,
            text: [
              "⭐ TIPOS DE PERGUNTA",
              "",
              `1️⃣ ${line("Clássica", !!qt.classica)}`,
              `2️⃣ ${line("VHS Vault", !!qt.vhs)}`,
              `3️⃣ ${line("Manchete", !!qt.manchete)}`,
              `4️⃣ ${line("Embalagem / Instruções", !!qt.instrucao)}`,
              "0️⃣ Voltar",
              "",
              "Digite o número para ativar/desativar 👇",
            ].join("\n"),
          }),
        );
        return buildOutput(state, actions, { config: "qtypes_menu" }, message);
      }
      if (n === 3) {
        uctx.step = "CONFIG_MAXPLAYERS";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `👥 MÁXIMO DE JOGADORES\n\nAtual: ${room.max_players}\n\nDigite um número entre 2 e 12 👇` }));
        return buildOutput(state, actions, { config: "max_prompt" }, message);
      }
      if (n === 4) {
        uctx.step = "CONFIG_VISIBILITY";
        actions.push(
          actionSend({
            channel: "private",
            chat_id: sender_chat_id,
            text: [
              "🔓 VISIBILIDADE DA SALA",
              "",
              "1️⃣ Pública",
              "2️⃣ Privada (exige senha)",
              "3️⃣ Oculta (não aparece na lista e exige senha)",
              "0️⃣ Voltar",
              "",
              "Digite o número 👇",
            ].join("\n"),
          }),
        );
        return buildOutput(state, actions, { config: "vis_menu" }, message);
      }
      if (n === 5) {
        uctx.step = "CONFIG_MODE";
        actions.push(
          actionSend({
            channel: "private",
            chat_id: sender_chat_id,
            text: [
              "🎮 ALTERAR MODO DE JOGO",
              "",
              `Modo atual: ${room.mode === "EAY" ? "EAY" : "Clássico"}`,
              "",
              "1️⃣ Clássico",
              "2️⃣ EAY (Enough About You)",
              "0️⃣ Voltar",
              "",
              "Digite o número 👇",
            ].join("\n"),
          }),
        );
        return buildOutput(state, actions, { config: "mode_menu" }, message);
      }
      if (n === 6) {
        uctx.step = "CONFIG_END_CONFIRM";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Tem certeza que deseja encerrar a sala?\n\n1️⃣ Confirmar\n0️⃣ Cancelar\n\nDigite o número 👇" }));
        return buildOutput(state, actions, { config: "end_confirm" }, message);
      }

      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Opção inválida. Digite 0 a 6 👇" }));
      return buildOutput(state, actions, { config: "invalid" }, message);
    }

    if (uctx.step === "CONFIG_ROUNDS" && isHost(room, sender_chat_id)) {
      const n = c.cmd === "number" ? c.n : c.cmd === "text" ? parseIntStrict(c.text) : null;
      if (n === null || n < 1 || n > 10) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Valor inválido. Digite um número entre 1 e 10 👇" }));
        return buildOutput(state, actions, { config_rounds: "invalid" }, message);
      }
      room.rounds_total = n;
      afterBigEventPause(room);
      uctx.step = "ROOM_CONFIG_MENU";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Número de rodadas alterado para ${n}.\n\nEnvie continuar quando quiser retomar qualquer fluxo.\n\n(Voltando ao menu…)` }));
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
      return buildOutput(state, actions, { config_rounds: "ok" }, message);
    }

    if (uctx.step === "CONFIG_QTYPES" && isHost(room, sender_chat_id) && c.cmd === "number") {
      const qt = room.question_types;
      if (c.n === 0) {
        uctx.step = "ROOM_CONFIG_MENU";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room) }));
        return buildOutput(state, actions, { qtypes: "back" }, message);
      }

      const map = { 1: "classica", 2: "vhs", 3: "manchete", 4: "instrucao" };
      const key = map[c.n];
      if (!key) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Digite 1, 2, 3, 4 ou 0 👇" }));
        return buildOutput(state, actions, { qtypes: "invalid" }, message);
      }

      qt[key] = !qt[key];
      const anyOn = !!qt.classica || !!qt.vhs || !!qt.manchete || !!qt.instrucao;
      if (!anyOn) {
        qt[key] = true;
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Pelo menos um tipo de pergunta precisa estar ativo." }));
      } else {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Atualizado: ${key} agora está ${qt[key] ? "✅ ATIVO" : "❌ DESATIVADO"}` }));
      }
      afterBigEventPause(room);
      return buildOutput(state, actions, { qtypes: "toggled" }, message);
    }

    if (uctx.step === "CONFIG_MAXPLAYERS" && isHost(room, sender_chat_id)) {
      const n = c.cmd === "number" ? c.n : c.cmd === "text" ? parseIntStrict(c.text) : null;
      if (n === null || n < 2 || n > 12) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Valor inválido. Digite um número entre 2 e 12 👇" }));
        return buildOutput(state, actions, { max: "invalid" }, message);
      }
      const current = room.players_order.length;
      if (n < current) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `⚠️ Não é possível definir abaixo da quantidade atual de jogadores (${current}).` }));
        return buildOutput(state, actions, { max: "below_current" }, message);
      }

      room.max_players = n;
      afterBigEventPause(room);
      uctx.step = "ROOM_CONFIG_MENU";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Máx jogadores alterado para ${n}.\n\n(Voltando ao menu…)` }));
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
      return buildOutput(state, actions, { max: "ok" }, message);
    }

    if (uctx.step === "CONFIG_VISIBILITY" && isHost(room, sender_chat_id) && c.cmd === "number") {
      if (c.n === 0) {
        uctx.step = "ROOM_CONFIG_MENU";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room) }));
        return buildOutput(state, actions, { vis: "back" }, message);
      }
      if (![1, 2, 3].includes(c.n)) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Digite 1, 2, 3 ou 0 👇" }));
        return buildOutput(state, actions, { vis: "invalid" }, message);
      }

      const newVis = c.n === 1 ? "publica" : c.n === 2 ? "privada" : "oculta";
      room.visibility = newVis;
      if (newVis === "publica") {
        room.password = null;
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "✅ Sala agora está Pública (sem senha)." }));
        afterBigEventPause(room);
        uctx.step = "ROOM_CONFIG_MENU";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
        return buildOutput(state, actions, { vis: "public_ok" }, message);
      }

      uctx.step = "CONFIG_SET_PASSWORD";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🔐 Esta visibilidade exige senha.\n\nDigite a nova senha 👇\n\n(Mínimo 4 caracteres)" }));
      return buildOutput(state, actions, { vis: "ask_pwd" }, message);
    }

    if (uctx.step === "CONFIG_SET_PASSWORD" && isHost(room, sender_chat_id) && c.cmd === "text") {
      const pass = String(c.text ?? "").trim();
      if (pass.length < 4) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Senha muito curta. Mínimo 4 caracteres 👇" }));
        return buildOutput(state, actions, { set_pwd: "too_short" }, message);
      }

      room.password = pass;
      afterBigEventPause(room);
      uctx.step = "ROOM_CONFIG_MENU";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Senha definida. Sala agora está ${room.visibility === "privada" ? "Privada" : "Oculta"}.` }));
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
      return buildOutput(state, actions, { set_pwd: "ok" }, message);
    }

    if (uctx.step === "CONFIG_MODE" && isHost(room, sender_chat_id) && c.cmd === "number") {
      if (c.n === 0) {
        uctx.step = "ROOM_CONFIG_MENU";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room) }));
        return buildOutput(state, actions, { mode: "back" }, message);
      }
      if (![1, 2].includes(c.n)) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Digite 1, 2 ou 0 👇" }));
        return buildOutput(state, actions, { mode: "invalid" }, message);
      }

      room.mode = c.n === 2 ? "EAY" : "CLASSIC";
      afterBigEventPause(room);
      uctx.step = "ROOM_CONFIG_MENU";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Modo alterado para ${room.mode === "EAY" ? "EAY (Enough About You)" : "Clássico"}.\n\n(Voltando ao menu…)` }));
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
      return buildOutput(state, actions, { mode: "ok" }, message);
    }

    if (uctx.step === "CONFIG_END_CONFIRM" && isHost(room, sender_chat_id) && c.cmd === "number") {
      if (c.n === 0) {
        uctx.step = "ROOM_CONFIG_MENU";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "Cancelado.\n\nVoltando ao menu de configurações…" }));
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
        return buildOutput(state, actions, { end: "cancel" }, message);
      }
      if (c.n === 1) {
        room.status = "ENDED";
        room.game.phase = "WAITING";
        if (room.screen_group_id) actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: "🚫 A sala foi encerrada pelo host.\n\nObrigado por jogar! 🎲" }));
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🔴 Sala encerrada com sucesso." }));
        actions.push({ json: { route: "apagar_sala", payload: { sala_id: room.code } } });
        return buildOutput(state, actions, { end: "confirmed" }, message);
      }

      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Digite 1 para confirmar ou 0 para cancelar 👇" }));
      return buildOutput(state, actions, { end: "invalid" }, message);
    }

    if (c.cmd === "add_bots" && isHost(room, sender_chat_id)) {
      const n = c.n;
      const existingBots = room.players_order.filter((pid) => room.players[pid]?.is_bot).length;
      const canAdd = Math.max(0, room.max_players - room.players_order.length);
      const toAdd = Math.min(n, canAdd);

      if (toAdd <= 0) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Não é possível adicionar mais bots (sala cheia)." }));
        return buildOutput(state, actions, { add_bots: "room_full" }, message);
      }

      for (let i = 0; i < toAdd; i++) {
        const botId = `bot_${room.code}_${existingBots + i + 1}`;
        const botName = `Bot_${String.fromCharCode(65 + ((existingBots + i) % 26))}`;
        addPlayerToRoom(room, botId, botName, true);
      }

      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `🤖✨ ${toAdd} bot(s) foram adicionados à sua sala!\n\nEles vão participar normalmente: mentir, votar e pontuar 🎲` }));

      if (room.screen_group_id) {
        const newBots = room.players_order.map((pid) => room.players[pid]).filter((p) => p?.is_bot).slice(-toAdd);
        for (const b of newBots) actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: `🤖✨ ${b.name} entrou na sala!` }));
        actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: roomPanelText(room), delay_seconds: 1 }));
      }

      afterBigEventPause(room);
      return buildOutput(state, actions, { add_bots: "ok" }, message);
    }

    if (room.status === "IN_GAME" && room.game.phase === "COLLECTING") {
      const round = room.game.round;

      if (round.mode === "CLASSIC") {
        if (room.players[sender_chat_id]?.is_bot) return buildOutput(state, [], { classic: "bot_ignored" }, message);

        if (c.cmd === "text") {
          round.submissions[sender_chat_id] = c.text;
          actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "✅ Resposta recebida!\n\nSua mentira foi registrada 📝✨\nAguardando os outros jogadores..." }));

          if (room.screen_group_id) {
            actions.push(
              actionSend({
                channel: "group",
                chat_id: room.screen_group_id,
                text: [
                  "✍️ Respostas enviadas:",
                  ...room.players_order.map((pid) => {
                    const p = room.players[pid];
                    const ok = !!round.submissions[pid];
                    return `${ok ? "✔️" : "⏳"} ${p?.name ?? pid}${p?.is_bot ? " 🤖" : ""}`;
                  }),
                ].join("\n"),
              }),
            );
          }

          if (allHumansSubmittedClassic(room)) {
            room.game.phase = "VOTING";
            buildVotingOptionsClassic(room);

            if (room.screen_group_id) actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: votingText(room) }));

            for (const pid of room.players_order) {
              const p = room.players[pid];
              if (!p || p.is_bot) continue;
              actions.push(actionSend({ channel: "private", chat_id: pid, text: "🗳️ Vote na opção que você acha que é a verdadeira.\n\nResponda com a letra (A, B, C...) 👇" }));
            }

            const opts = room.game.round.options;
            const letters = opts.map((o) => o.letter);
            const rng = makeRng(`${room.code}|botvote|classic|r${room.game.round_index}|${Date.now()}|${Math.random()}`);
            for (const pid of room.players_order) {
              const p = room.players[pid];
              if (!p || !p.is_bot) continue;
              room.game.round.votes[pid] = letters[Math.floor(rng() * letters.length)];
            }
          }

          return buildOutput(state, actions, { classic_collect: "ok" }, message);
        }

        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "✍️ Nesta fase, envie sua resposta em texto para continuar a rodada." }));
        return buildOutput(state, actions, { classic_collect: "ignored_nontext" }, message);
      }

      if (round.mode === "EAY") {
        const chosen = round.chosen_chat_id;

        if (c.cmd === "text") {
          if (sender_chat_id === chosen) {
            round.true_answer = c.text;
            actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "✅ Sua resposta verdadeira foi registrada!" }));

            if (room.screen_group_id) {
              actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: "✍️ Atualização da rodada\n\n✔️ O escolhido já respondeu.\n⏳ Aguardando as mentiras dos demais jogadores…" }));
            }
          } else if (!room.players[sender_chat_id]?.is_bot) {
            round.lies[sender_chat_id] = c.text;
            actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "✅ Mentira registrada! 🕵️" }));
          }

          if (allNeededSubmittedEAY(room)) {
            room.game.phase = "VOTING";
            buildVotingOptionsEAY(room);

            if (room.screen_group_id) actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: votingText(room) }));

            for (const pid of room.players_order) {
              const p = room.players[pid];
              if (!p || p.is_bot) continue;
              if (pid === chosen) actions.push(actionSend({ channel: "private", chat_id: pid, text: "⭐ Você é o escolhido.\nVote na mentira que você mais gostou.\n\nResponda com a letra (A, B, C...) 👇" }));
              else actions.push(actionSend({ channel: "private", chat_id: pid, text: "🗳️ Vote na opção que você acha que é a verdadeira do escolhido.\n\nResponda com a letra (A, B, C...) 👇" }));
            }

            const opts = room.game.round.options;
            const letters = opts.map((o) => o.letter);
            const rng = makeRng(`${room.code}|botvote|eay|r${room.game.round_index}|${Date.now()}|${Math.random()}`);
            for (const pid of room.players_order) {
              const p = room.players[pid];
              if (!p || !p.is_bot) continue;
              room.game.round.votes_truth[pid] = letters[Math.floor(rng() * letters.length)];
            }
          }

          if (room.game.phase === "COLLECTING" && room.screen_group_id) {
            const chosenName = room.players[chosen]?.name ?? "Escolhido";
            const lines = [];
            lines.push("✍️ Atualização da rodada");
            lines.push("");
            lines.push(`${round.true_answer ? "✔️" : "⏳"} O escolhido (${chosenName}) respondeu.`);
            for (const pid of room.players_order) {
              if (pid === chosen) continue;
              const p = room.players[pid];
              if (!p) continue;
              const ok = !!round.lies[pid] || !!p.is_bot;
              lines.push(`${ok ? "✔️" : "⏳"} ${p.name}${p.is_bot ? " 🤖" : ""}`);
            }
            actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: lines.join("\n") }));
          }

          return buildOutput(state, actions, { eay_collect: "ok" }, message);
        }

        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: sender_chat_id === round.chosen_chat_id ? "✍️ Você é o escolhido: envie sua resposta verdadeira em texto." : "🕵️ Envie sua mentira em texto para continuar a rodada." }));
        return buildOutput(state, actions, { eay_collect: "ignored_nontext" }, message);
      }
    }

    if (room.status === "IN_GAME" && room.game.phase === "VOTING") {
      const round = room.game.round;
      const voteLetter = String(textRaw).trim().toUpperCase();
      const validLetters = new Set((round.options || []).map((o) => o.letter));

      if (!validLetters.has(voteLetter)) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Voto inválido. Responda apenas com a letra (A, B, C...)." }));
        return buildOutput(state, actions, { vote: "invalid" }, message);
      }

      if (round.mode === "CLASSIC") {
        if (room.players[sender_chat_id]?.is_bot) return buildOutput(state, [], { vote: "bot_ignored" }, message);

        round.votes[sender_chat_id] = voteLetter;
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🗳️ Voto registrado!" }));

        let allVoted = true;
        for (const pid of room.players_order) {
          const p = room.players[pid];
          if (!p || p.is_bot) continue;
          if (!round.votes[pid]) {
            allVoted = false;
            break;
          }
        }

        if (allVoted) {
          room.game.phase = "REVEAL";
          computeRevealClassic(room);

          if (room.screen_group_id) {
            actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: "🗳️ Todos os votos foram recebidos!\n\n━━━━━━━━━━━━━━━\n📊 Calculando resultados..." }));
          }

          const revealAi = callAiReveal({ room, message, state });
          if (revealAi) actions.push(revealAi);

          afterBigEventPause(room);
          actions.push(actionSend({ channel: "private", chat_id: room.host_chat_id, text: "Rodada encerrada.\n\nDigite continuar para prosseguir (ou no grupo: ,continuar)." }));
        }

        return buildOutput(state, actions, { vote: "classic_ok" }, message);
      }

      if (round.mode === "EAY") {
        const chosen = round.chosen_chat_id;

        if (sender_chat_id === chosen) {
          round.chosen_fav_vote = voteLetter;
          actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⭐ Voto favorito registrado!" }));
        } else {
          if (room.players[sender_chat_id]?.is_bot) return buildOutput(state, [], { vote: "bot_ignored" }, message);
          round.votes_truth[sender_chat_id] = voteLetter;
          actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🗳️ Voto registrado!" }));
        }

        let allTruthVoted = true;
        for (const pid of room.players_order) {
          const p = room.players[pid];
          if (!p || p.is_bot || pid === chosen) continue;
          if (!round.votes_truth[pid]) {
            allTruthVoted = false;
            break;
          }
        }
        const chosenDone = !!round.chosen_fav_vote;

        if (allTruthVoted && chosenDone) {
          room.game.phase = "REVEAL";
          computeRevealEAY(room);

          if (room.screen_group_id) {
            actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: "🗳️ Todos os votos foram recebidos!\n\n━━━━━━━━━━━━━━━\n📊 Calculando resultados..." }));
          }

          const revealAi = callAiReveal({ room, message, state });
          if (revealAi) actions.push(revealAi);

          afterBigEventPause(room);
          actions.push(actionSend({ channel: "private", chat_id: room.host_chat_id, text: "Rodada encerrada.\n\nDigite continuar para prosseguir (ou no grupo: ,continuar)." }));
        }

        return buildOutput(state, actions, { vote: "eay_ok" }, message);
      }
    }

    if (c.cmd === "text" && normalizeAnswerText(c.text) === "painel" && isHost(room, sender_chat_id)) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🎲 PAINEL DA SALA\n\n" + roomPanelText(room) }));
      return buildOutput(state, actions, { painel: true }, message);
    }
  }

  const fallbackRoomCode = findUserRoomCode();
  const fallbackRoom = fallbackRoomCode ? getRoomByCode(fallbackRoomCode) : null;
  if (fallbackRoom && fallbackRoom.status === "IN_GAME") {
    const ai = actionAiJob(
      {
        reason: "HELP_GENERAL",
        scene: "unknown_command_in_game",
        sala_id: fallbackRoom.code,
        fase: String(fallbackRoom?.game?.phase ?? ""),
        round: Number(fallbackRoom?.game?.round_index ?? 0),
        last_message_text: textRaw,
      },
      state,
      message,
    );
    if (ai) actions.push(ai);
    return buildOutput(state, actions, { fallback: "ai_help_in_game" }, message);
  }

  actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Não entendi esse comando. Dá uma olhada nas opções do menu abaixo 👇" }));
  actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: lobbyMenuText(), delay_seconds: 0 }));
  return buildOutput(state, actions, { fallback: "lobby_menu" }, message);
}

return buildOutput(state, actions, { unhandled: true, parsed }, message);
