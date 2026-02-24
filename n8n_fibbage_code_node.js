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

// Parser flexível para números de menu - aceita 1, 1), 1., 1️⃣, opção 2, etc.
function parseMenuNumberLoose(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;

  // Normaliza keycaps (0️⃣…9️⃣ e 🔟) para dígitos antes das regex.
  // Isso evita falha de parsing quando o input contém apenas emoji numérico.
  const keycapMap = {
    "0️⃣": "0",
    "1️⃣": "1",
    "2️⃣": "2",
    "3️⃣": "3",
    "4️⃣": "4",
    "5️⃣": "5",
    "6️⃣": "6",
    "7️⃣": "7",
    "8️⃣": "8",
    "9️⃣": "9",
    "🔟": "10",
  };

  const keycaps = Object.keys(keycapMap);
  let keycapNormalized = s;
  for (const keycap of keycaps) {
    keycapNormalized = keycapNormalized.split(keycap).join(keycapMap[keycap]);
  }

  const keycapNumber = parseIntStrict(keycapNormalized);
  if (keycapNumber !== null) return keycapNumber;

  // Reaplicação: extrair número de várias formas sobre o texto já normalizado
  const patterns = [
    /^(\d+)\)?\.?\s*$/,           // 1, 1), 1., 1 ), 1 .
    /^(\d+)\)?\.?\s+.+$/,          // 1 texto, 1) texto
    /^opção\s+(\d+)/i,            // opção 1
    /^opc?\.?\s*(\d+)/i,          // opc 1, opc. 1
  ];

  for (const pattern of patterns) {
    const m = keycapNormalized.match(pattern);
    if (m) {
      const n = parseIntStrict(m[1] || keycapNormalized);
      if (n !== null) return n;
    }
  }

  // Se nada funcionou, tentar parseIntStrict no texto normalizado
  return parseIntStrict(keycapNormalized);
}

// Mapeamento de steps legados para steps atuais
const LEGACY_STEP_MAP = {
  // Criação de sala
  "CREATE_STEP_NAME": "ROOM_CREATE_NAME",
  "CREATE_STEP_VISIBILITY": "ROOM_CREATE_VISIBILITY",
  "CREATE_STEP_PASSWORD": "ROOM_CREATE_PASSWORD",
  "CREATE_STEP_MODE": "ROOM_CREATE_MODE",
  "CREATE_STEP_ROUNDS": "ROOM_CREATE_ROUNDS",
  "CREATE_WAIT_VINC": "ROOM_CREATE_WAIT_VINC",
  "ROOM_CREATE": "ROOM_CREATE_NAME",
  
  // Lobby
  "LOBBY_MENU": "BOT_ACCESS",
  "LOBBY": "BOT_ACCESS",
  "BOT_ACTIVE": "BOT_ACCESS",
  
  // Tutorial
  "ROOM_START_TUTORIAL_Q": "ASK_TUTORIAL",
  "ASK_TUTORIAL_YES": "ASK_TUTORIAL",
  
  // Config legada
  "CONFIG_NAME": "CONFIG_RENAME",
  "CONFIG_PASSWORD": "CONFIG_SET_PASSWORD",
  
  // Entrada
  "ENTERING_PASSWORD": "ENTER_PASSWORD",
  "ENTER_PASSWORD_WAIT": "ENTER_PASSWORD",
};

// Normaliza steps legados para steps atuais
function normalizeLegacyStep(step) {
  if (!step) return step;
  const normalized = String(step).trim();
  return LEGACY_STEP_MAP[normalized] || normalized;
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

const CEREBRO_AI_PROMPT = [
  "Você é a IA auxiliar do cérebro do Fibbage (WhatsApp).",
  "NUNCA envie mensagem direto ao usuário final.",
  "Seu retorno SEMPRE deve ser estruturado para o cérebro decidir para quem enviar.",
  "Respeite o reason/scene recebidos no payload.",
  "Quando gerar pergunta/verdade/mentiras, mantenha texto curto, claro e jogável em PT-BR.",
  "Quando narrar reveal, use tom divertido, sem ofensas, e sem expor dados sensíveis.",
  "Formato de saída preferencial:",
  '{\"updates\": {...}, \"dispatch\": [{\"channel\":\"group|private\",\"chat_id\":\"...\",\"text\":\"...\",\"delay_seconds\":0}]}',
  "Se não houver dispatch, devolva ao menos updates e um resumo em summary.",
].join('\n');

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

  const roomRef = p.sala_id ? state?.rooms?.[p.sala_id] : null;
  p.group_chat_id = String(p.group_chat_id ?? roomRef?.screen_group_id ?? "");
  p.host_chat_id = String(p.host_chat_id ?? roomRef?.host_chat_id ?? "");
  p.system_prompt = String(p.system_prompt ?? CEREBRO_AI_PROMPT);

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
    } else if (senderId && msg.chat_type === "private") {
      // SOLUÇÃO: Só registrar participantes no BOT_ACCESS parachats privados
      // Grupos não devem ser registrados como participantes
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
    "1️⃣ Alterar nome da sala",
    "2️⃣ Alterar número de rodadas",
    "3️⃣ Tipos de pergunta",
    "4️⃣ Alterar máximo de jogadores",
    "5️⃣ Alterar visibilidade",
    "6️⃣ Alterar modo (Clássico / EAY)",
    "7️⃣ Adicionar bots à sala",
    "8️⃣ Expulsar jogador",
    "9️⃣ Encerrar sala",
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
  
  // Detecção mais robusta de grupo vs privado
  //优先使用message.chat_type, mas também verificar other indicators
  let isGroup = message.chat_type === "group";
  let isPrivate = message.chat_type === "private";
  
  // Se chat_type não foi definido explicitamente, tentar detectar por outros sinais
  if (!isGroup && !isPrivate) {
    // Se há um group_id diferente do sender, é grupo
    const chatId = String(message.chat_id ?? "");
    const senderId = String(message.sender_chat_id ?? "");
    // No WhatsApp, grupos usually have different IDs
    // Se chat_id for diferente do sender_chat_id e parece um ID de grupo...
    if (chatId && senderId && chatId !== senderId) {
      // Tentar detectar por padrões comuns de ID de grupo
      // Geralmente IDs de grupo são mais longos ou contêm certos padrões
      if (chatId.length > 20 || chatId.includes("@g")) {
        isGroup = true;
      }
    }
  }

  const sender_chat_id = String(message.sender_chat_id ?? "");
  const chat_id = String(message.chat_id ?? "");
  const sender_name = String(message.sender_name ?? "");

  
  
  if (isGroup) {
    // Apenas processar mensagens de grupo se começarem com 'vinc' ou ','
    const text = String(message.text ?? "").trim();
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

function updatePlayerNameAcrossRooms(state, player_chat_id, newName) {
  for (const room of Object.values(state.rooms || {})) {
    if (!room || room.status === "ENDED") continue;
    if (room.players?.[player_chat_id]) {
      room.players[player_chat_id].name = newName;
    }
  }
}

function resolvePostSetNameStep(uctx, hasActiveRoom) {
  const prev = String(uctx.step_before_set_name ?? "").trim();
  uctx.step_before_set_name = null;
  if (prev) return prev;
  return hasActiveRoom ? "IN_ROOM" : "BOT_ACCESS";
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

  // text: priorizar a mensagem do cliente (client_last_message_text)
  // isso é o que o usuário enviou no privado do bot
  // text: PRIORIZAR sender (data[1]) - dados atuais da mensagem
  // sender.text contém a mensagem que o usuário enviou AGORA
  // ctx tem dados desatualizados da interação anterior
  const rawText = 
    sender?.text ?? 
    ctx?.client_last_message_text ?? 
    ctx?.last_message_text ?? 
    webhook?.body?.Payload?.Content?.LastMessage?.Content ?? 
    "";
  const text = norm(rawText);

  // Detectar se é grupo ou privado
  // Prioridade: ContactType do webhook
  const isGroup = (() => {
    const contactType = webhook?.body?.Payload?.Content?.Contact?.ContactType;
    const groupId = webhook?.body?.Payload?.Content?.Contact?.GroupIdentifier ?? webhook?.body?.Payload?.Content?.GroupIdentifier;
    
    // Se tem GroupIdentifier, é grupo
    if (groupId) return true;
    
    // Se tem ContactType e não é DirectMessage, é grupo
    if (contactType && contactType !== "DirectMessage") return true;
    
    // Se é DirectMessage, é privado
    if (contactType === "DirectMessage") return false;
    
    return false; // default: privado
  })();

  // chat_id: é o ID da conversa/chat atual (onde a mensagem foi recebida)
  // PRIORIDADE: sender.sender_chat_id (chat atual do remetente) > webhook > fallback
  // IMPORTANTE: sender.sender_chat_id é o chat atual onde o usuário está interagindo
  const chatId =
    sender?.sender_chat_id ??
    webhook?.body?.Payload?.Content?.Id ??
    webhook?.body?.Payload?.Content?.LastMessage?.Chat?.Id ??
    "UNKNOWN";

  // sender_chat_id: PRIORIZAR o sender (data[1]) - é quem enviou a mensagem!
  // só usar fallback do webhook se não tiver no sender
  const senderChatId = 
    sender?.sender_chat_id ?? 
    webhook?.body?.Payload?.Content?.LastMessage?.FromContact?.Id ??
    webhook?.body?.Payload?.Content?.Contact?.Id ??
    chatId;

  // sender_name: PRIORIZAR o sender (data[1]) - é quem enviou a mensagem!
  const senderName = 
    sender?.sender_name ?? 
    webhook?.body?.Payload?.Content?.Contact?.Name ??
    ctx?.sender_name ??
    ctx?.nome ??
    "Jogador";

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

  const inferStepFromLastCompanyPrompt = () => {
    const all = Array.isArray(ctx?.context_all) ? ctx.context_all : [];
    const isCompanyRole = (r) => {
      const rr = String(r ?? "").toLowerCase();
      return rr === "company" || rr === "ia" || rr === "equipe" || rr === "assistant";
    };

    const detectStepFromText = (rawText) => {
      const txt = String(rawText ?? "").toLowerCase();
      if (!txt) return null;
      if (txt.includes("alterar nome") || txt.includes("digite o novo nome")) return "SET_NAME";
      if (txt.includes("passo 1/5") && txt.includes("nome da sala")) return "ROOM_CREATE_NAME";
      if (txt.includes("passo 2/5") && txt.includes("visibilidade")) return "ROOM_CREATE_VISIBILITY";
      if (txt.includes("passo 3/5") && txt.includes("definir senha")) return "ROOM_CREATE_PASSWORD";
      if (txt.includes("passo 4/5") && txt.includes("modo de jogo")) return "ROOM_CREATE_MODE";
      if (txt.includes("passo 5/5") && txt.includes("número de rodadas")) return "ROOM_CREATE_ROUNDS";
      if (txt.includes("esta sala exige senha") && txt.includes("digite a senha")) return "ENTER_PASSWORD";
      if (txt.includes("deseja exibir um breve tutorial")) return "ASK_TUTORIAL";
      return null;
    };

    for (const e of [...all].reverse()) {
      if (!isCompanyRole(e?.role) || !e?.text) continue;
      const step = detectStepFromText(e.text);
      if (step) return step;
    }

    const stepFromTranscript = detectStepFromText(ctx?.context_all_text);
    if (stepFromTranscript) return stepFromTranscript;

    return null;
  };

  // Reconstruir salas a partir do datastore (estado_json_raw ou status_json dos participantes)
  const salasRows = ctx?.datastore?.salas || ctx?.salas_rows || [];
  
  for (const salaRow of salasRows) {
    const salaId = String(salaRow?.sala_id ?? "").trim();
    if (!salaId || s.rooms[salaId]) continue;
    
    // Tentar reconstruir do estado_json_raw
    let roomObj = null;
    if (salaRow?.estado_json_raw) {
      try {
        roomObj = typeof salaRow.estado_json_raw === "string" 
          ? JSON.parse(salaRow.estado_json_raw) 
          : salaRow.estado_json_raw;
      } catch (e) {}
    }
    
    if (roomObj && roomObj.code) {
      s.rooms[salaId] = roomObj;
    }
  }
  
  // Se não conseguimos reconstruir salas do estado_json_raw, tentar do status_json dos participantes
  const participantesRows = ctx?.datastore?.participantes || ctx?.participantes_rows || [];
  
  for (const pRow of participantesRows) {
    const pSalaId = String(pRow?.sala_id ?? "").trim();
    if (!pSalaId || pSalaId === "BOT_ACCESS" || s.rooms[pSalaId]) continue;
    
    let pStatus = null;
    try {
      if (typeof pRow?.status_json === "string" && pRow.status_json.trim()) {
        pStatus = JSON.parse(pRow.status_json);
      } else if (pRow?.status_json && typeof pRow.status_json === "object") {
        pStatus = pRow.status_json;
      }
    } catch (e) {}
    
    if (pStatus?.runtime?.room && pStatus.runtime.room.code) {
      const roomInfo = pStatus.runtime.room;
      // Criar um skeleton da sala a partir das informações do participante
      s.rooms[pSalaId] = {
        code: roomInfo.code,
        status: roomInfo.status || "CREATING",
        name: roomInfo.name || null,
        visibility: null,
        password: null,
        mode: roomInfo.mode || "CLASSIC",
        rounds_total: roomInfo.rounds_total || 5,
        max_players: 8,
        question_types: { classica: true, vhs: true, manchete: true, instrucao: true },
        screen_group_id: roomInfo.screen_group_id || null,
        host_chat_id: roomInfo.host_chat_id || "",
        players: {},
        players_order: [],
        game: {
          phase: roomInfo.phase || "WAITING",
          round_index: roomInfo.round_index || 0,
          mode_runtime: null,
          waiting_reason: null,
          last_big_event: null,
          scores: {},
          round: null,
        },
      };
    }
  }
  
  // Adicionar participantes às salas reconstruídas
  for (const pRow of participantesRows) {
    const pSalaId = String(pRow?.sala_id ?? "").trim();
    const pChatId = String(pRow?.chat_id ?? "").trim();
    if (!pSalaId || !pChatId || pSalaId === "BOT_ACCESS") continue;
    
    const targetRoom = s.rooms[pSalaId];
    if (!targetRoom) continue;
    
    if (!targetRoom.players[pChatId]) {
      targetRoom.players[pChatId] = {
        chat_id: pChatId,
        name: String(pRow?.nome ?? "Jogador"),
        is_bot: false,
      };
      if (!targetRoom.players_order.includes(pChatId)) {
        targetRoom.players_order.push(pChatId);
      }
      targetRoom.game.scores[pChatId] = targetRoom.game.scores[pChatId] ?? Number(pRow?.pontos ?? 0);
    }
    
    // Atualizar host se necessário
    if (pRow?.role === "host" && !targetRoom.host_chat_id) {
      targetRoom.host_chat_id = pChatId;
    }
  }
  


  const senderId = String(sender?.sender_chat_id ?? ctx?.sender_chat_id ?? "").trim();
  if (!senderId) return s;

  // nome: PRIORIZAR sender (data[1]) - é quem enviou a mensagem!
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
    // Primeiro, verificar se há um step no status_json do ctx (do aggregate)
    const fromStatus = String(parsedStatus?.context?.step ?? "").trim();
    if (fromStatus) {
      console.log("[DEBUG hydrateState] inferredStep from status_json:", fromStatus);
      return fromStatus;
    }
    
    // Verificar status flat
    const fromFlatStatus = String(ctx?.status ?? "").trim().toLowerCase();
    if (fromFlatStatus === "ativo") {
      console.log("[DEBUG hydrateState] inferredStep from ctx.status = ativo:", "BOT_ACCESS");
      return "BOT_ACCESS";
    }
    if (fromFlatStatus === "inativo") {
      console.log("[DEBUG hydrateState] inferredStep from ctx.status = inativo:", "BOT_INACTIVE");
      return "BOT_INACTIVE";
    }
    if (!hasParticipantInAggregate) {
      console.log("[DEBUG hydrateState] inferredStep no participant:", "BOT_INACTIVE");
      return "BOT_INACTIVE";
    }
    console.log("[DEBUG hydrateState] inferredStep default:", "BOT_ACCESS");
    return "BOT_ACCESS";
  })();

  const inferredRoom =
    String(parsedStatus?.context?.current_room_code ?? "").trim() ||
    String(parsedStatus?.runtime?.room?.code ?? "").trim() ||
    String(ctx?.sala_id ?? "").trim();

  // NÃO sobrescrever steps de criação de sala ou entrada de texto
  // Esses steps devem ser preservados SEMPRE, independentemenete do status
  const preservedSteps = new Set([
    "BOT_ACCESS",
    "BOT_INACTIVE",
    "IN_ROOM",
    "ROOM_CREATE_NAME",
    "ROOM_CREATE_VISIBILITY",
    "ROOM_CREATE_PASSWORD",
    "ROOM_CREATE_MODE",
    "ROOM_CREATE_ROUNDS",
    "ROOM_CREATE_WAIT_VINC",
    "SET_NAME",
    "ENTER_PASSWORD",
    "CONFIG_SET_PASSWORD",
    "CONFIG_RENAME",
    "CONFIG_ROUNDS",
    "CONFIG_QTYPES",
    "CONFIG_MAXPLAYERS",
    "CONFIG_VISIBILITY",
    "CONFIG_MODE",
    "CONFIG_ADDBOTS",
    "CONFIG_KICK",
    "CONFIG_END_CONFIRM",
    "ASK_TUTORIAL",
    "ROOM_CONFIG_MENU",
    // Steps legados também devem ser preservados
    "CREATE_STEP_NAME",
    "CREATE_STEP_VISIBILITY",
    "CREATE_STEP_PASSWORD",
    "CREATE_STEP_MODE",
    "CREATE_STEP_ROUNDS",
    "CREATE_WAIT_VINC",
    "LOBBY_MENU",
    "LOBBY",
    "BOT_ACTIVE",
    "ROOM_START_TUTORIAL_Q",
    "ENTERING_PASSWORD",
  ]);

  // Obter o contexto existente PRIMEIRO
  const existingCtx = s.user_context[senderId] || {};
  const existingStep = existingCtx.step;
  
  // DEBUG
  console.log("[DEBUG hydrateState] senderId (from sender):", senderId);
  console.log("[DEBUG hydrateState] existingCtx:", JSON.stringify(existingCtx));
  console.log("[DEBUG hydrateState] existingStep:", existingStep);
  console.log("[DEBUG hydrateState] inferredStep:", inferredStep);
  console.log("[DEBUG hydrateState] parsedStatus?.context?.step:", parsedStatus?.context?.step);
  console.log("[DEBUG hydrateState] ctx?.status:", ctx?.status);
  
  // Normalizar step existente para verificar se é um step legado
  const normalizedExistingStep = normalizeLegacyStep(existingStep);
  
  // Se já temos um step de criação/input, preservar step E room_code
  // Importante: fazer isso PRIMEIRO, antes de qualquer outra lógica
  // Isso é CRÍTICO para SET_NAME, ROOM_CREATE_*, etc.
  if (normalizedExistingStep && preservedSteps.has(normalizedExistingStep)) {
    console.log("[DEBUG hydrateState] PRESERVING step:", normalizedExistingStep);
    // Preservar o step existente SEM alterar - retornar imediatamente
    // Não fazer mais nenhuma modificação no step!
    return s;
  }

  // Caso contrário, usar a lógica normal
  
  // Steps que indicam que o usuário está em um fluxo de input de texto
  // e NÃO devem ser sobrescritos por ctx?.status === "ativo"
  const textInputFlowSteps = new Set([
    "SET_NAME",
    "ROOM_CREATE_NAME",
    "ROOM_CREATE_VISIBILITY",
    "ROOM_CREATE_PASSWORD",
    "ROOM_CREATE_MODE",
    "ROOM_CREATE_ROUNDS",
    "ROOM_CREATE_WAIT_VINC",
    "ENTER_PASSWORD",
    "CONFIG_SET_PASSWORD",
    "CONFIG_ROUNDS",
    "CONFIG_QTYPES",
    "CONFIG_MAXPLAYERS",
    "CONFIG_VISIBILITY",
    "CONFIG_MODE",
    "CONFIG_END_CONFIRM",
    "ASK_TUTORIAL",
    "ROOM_CONFIG_MENU",
    "IN_ROOM",
    // Steps legados
    "CREATE_STEP_NAME",
    "CREATE_STEP_VISIBILITY",
    "CREATE_STEP_PASSWORD",
    "CREATE_STEP_MODE",
    "CREATE_STEP_ROUNDS",
    "CREATE_WAIT_VINC",
    "LOBBY_MENU",
  ]);
  
  s.user_context[senderId] = {
    step: existingStep || inferredStep,
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

  // Verificar se o step atual (após merge) é um step de fluxo de input
  const mergedStep = s.user_context[senderId].step;
  console.log("[DEBUG hydrateState] mergedStep:", mergedStep);
  console.log("[DEBUG hydrateState] textInputFlowSteps.has(mergedStep):", textInputFlowSteps.has(mergedStep));
  
  // Só aplicar ctx?.status se o step atual NÃO é um fluxo de input
  if (!textInputFlowSteps.has(mergedStep)) {
    console.log("[DEBUG hydrateState] Applying ctx.status override:", ctx?.status);
    if (ctx?.status === "ativo") s.user_context[senderId].step = "BOT_ACCESS";
    if (ctx?.status === "inativo") s.user_context[senderId].step = "BOT_INACTIVE";
  } else {
    console.log("[DEBUG hydrateState] Skipping ctx.status override - step is in textInputFlowSteps");
  }

  if (ctx?.status !== "inativo") {
    // Só inferir step se não estamos em um fluxo de criação/input
    const currentStep = s.user_context[senderId].step;
    if (!textInputFlowSteps.has(currentStep) && currentStep !== "BOT_ACCESS" && currentStep !== "BOT_INACTIVE") {
      const hintedStep = inferStepFromLastCompanyPrompt();
      if (hintedStep) s.user_context[senderId].step = hintedStep;
    } else if (currentStep === "BOT_ACCESS") {
      // Se estamos em BOT_ACCESS, tentar inferir do histórico de conversa
      // (pode ser que o status_json não tenha sido atualizado ainda)
      const hintedStep = inferStepFromLastCompanyPrompt();
      if (hintedStep && textInputFlowSteps.has(hintedStep)) {
        s.user_context[senderId].step = hintedStep;
      }
    }
  }

  return s;
}

const input = $input.all();
const raw = input[0]?.json ?? {};
const compat = normalizeInputAggregate(raw);

// Extrair sender para debug (sender = data[1])
const dataArr = raw?.data;
const sender = Array.isArray(dataArr) ? (dataArr[1] || {}) : {};
const ctx = Array.isArray(dataArr) ? (dataArr[0] || {}) : {};

// DEBUG: Mostrar o que chegou no input
console.log("[DEBUG INPUT] raw.data.length:", dataArr?.length);
console.log("[DEBUG INPUT] sender (data[1]):", JSON.stringify(sender).slice(0, 300));
console.log("[DEBUG INPUT] ctx (data[0]):", JSON.stringify(ctx).slice(0, 300));

// Garantir que chat_type seja preservado de raw.message se existir
// PRIORIZAR compat.msg (extraído do sender/data[1]) - dados atuais da mensagem
// raw.message pode ter dados desatualizados do ctx anterior
const rawMessageChatType = raw.message?.chat_type;
const message = deepClone(compat.msg || raw.message || {});

// Se raw.message tinha chat_type, preservar
if (rawMessageChatType) {
  message.chat_type = rawMessageChatType;
}

// DEBUG: Log da message recebida
console.log("[DEBUG main] sender (data[1]):", JSON.stringify(sender).slice(0, 200));
console.log("[DEBUG main] raw.message (data[0]):", JSON.stringify(raw.message || {}).slice(0, 200));
console.log("[DEBUG main] compat.msg (from sender):", JSON.stringify(compat.msg || {}).slice(0, 200));
console.log("[DEBUG main] rawMessageChatType:", rawMessageChatType);
console.log("[DEBUG main] message.chat_type:", message.chat_type);
console.log("[DEBUG main] message.sender_chat_id:", message.sender_chat_id);
console.log("[DEBUG main] message.sender_name:", message.sender_name);
console.log("[DEBUG main] message.text:", message.text?.slice(0, 100));
console.log("[DEBUG main] === FIM DEBUG ===");

let state = ensureStateBase(raw.state || compat.st || {});
state = hydrateStateFromAggregateContext(state, compat);
const actions = [];

const aiResponseRaw = raw?.ai_response ?? raw?.ai_job_response ?? raw?.response_ai ?? (raw?.route === "ai_response" ? raw : null) ?? message?.ai_response ?? null;
if (aiResponseRaw) {
  const aiPayload = deepClone(aiResponseRaw?.payload ?? aiResponseRaw ?? {});
  const salaId = String(aiPayload.sala_id ?? aiPayload.room_code ?? "");
  const roomAi = salaId ? state.rooms?.[salaId] : null;

  if (roomAi && aiPayload?.updates && typeof aiPayload.updates === "object") {
    const upd = aiPayload.updates;
    if (roomAi?.game?.round && typeof upd.question_text === "string") roomAi.game.round.question_text = upd.question_text;
    if (roomAi?.game?.round && typeof upd.truth_text === "string") roomAi.game.round.truth_text = upd.truth_text;
    if (roomAi?.game?.round && typeof upd.narration_text === "string") roomAi.game.round.narration_text = upd.narration_text;
  }

  const dispatchList = Array.isArray(aiPayload.dispatch) ? aiPayload.dispatch : [];
  for (const d of dispatchList) {
    const channel = d?.channel === "group" ? "group" : "private";
    const cid = String(d?.chat_id ?? (channel === "group" ? roomAi?.screen_group_id : roomAi?.host_chat_id) ?? "");
    const txt = String(d?.text ?? "").trim();
    if (!cid || !txt) continue;
    actions.push(actionSend({ channel, chat_id: cid, text: txt, delay_seconds: d?.delay_seconds ?? 0 }));
  }

  if (roomAi && dispatchList.length === 0) {
    const summary = String(aiPayload.summary ?? aiPayload.text ?? "").trim();
    if (summary) {
      const targetCid = String(roomAi.screen_group_id ?? roomAi.host_chat_id ?? "");
      if (targetCid) actions.push(actionSend({ channel: roomAi.screen_group_id ? "group" : "private", chat_id: targetCid, text: summary }));
    }
  }

  return buildOutput(state, actions, { ai_response: "handled", sala_id: salaId, dispatch_count: dispatchList.length }, message);
}

const sender_chat_id = String(message.sender_chat_id ?? "");
const sender_name = String(message.sender_name ?? "Jogador");
const chat_type = message.chat_type;
const chat_id = String(message.chat_id ?? "");
const textRaw = String(message.text ?? "").trim();

// DEBUG: Log do step atual
const debugStep = state?.user_context?.[sender_chat_id]?.step;
console.log("[DEBUG] Mensagem:", textRaw);
console.log("[DEBUG] Step atual DO STATE:", debugStep);
console.log("[DEBUG] Room code:", state?.user_context?.[sender_chat_id]?.current_room_code);

if (!sender_chat_id || !chat_id || !chat_type) {
  return buildOutput(state, [], { error: "missing message fields", got: message }, message);
}

const profile = getUserProfile(state, sender_chat_id, sender_name);
const uctx = getUserCtx(state, sender_chat_id);

// Normalizar step atual para reconhecer steps legados
if (uctx.step) {
  const normalized = normalizeLegacyStep(uctx.step);
  if (normalized !== uctx.step) {
    console.log("[DEBUG] Normalizing step:", uctx.step, "->", normalized);
    uctx.step = normalized;
  }
}

const parsed = parseIncoming(message);

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

if (parsed.kind === "IGNORED_GROUP") {
  // Mostrar instruções no lobby do grupo
  actions.push(actionSend({ 
    channel: "group", 
    chat_id: parsed.chat_id, 
    text: [
      "📋✨ FIBBAGE – INSTRUÇÕES",
      "",
      "┌─ PARTICIPAR DO JOGO ─",
      "│",
      "│ 1️⃣  No privado do bot, envie: ,ativarbot",
      "│",
      "│ 2️⃣  Depois, envie: entrar XX",
      "│     (XX = código da sala)",
      "│",
      "└────────────────────────",
      "",
      "💡 Dúvidas? Chame o bot no privado!",
    ].join("\n")
  }));
  return buildOutput(state, actions, { ignored_group: true }, message);
}

if (parsed.kind === "VINC") {
  const code = parsed.code;
  const room = getRoomByCode(code);
  if (!room) {
    // Código inválido - informar ao host
    actions.push(actionSend({ channel: "group", chat_id: parsed.chat_id, text: `⚠️ Código de sala inválido: ${code}\n\nVerifique o código e tente novamente.` }));
    return buildOutput(state, actions, { vinc: "room_not_found", code }, message);
  }

  room.screen_group_id = parsed.chat_id;
  if (room.status === "CREATING") {
    room.status = "IN_ROOM";
    room.game.phase = "WAITING";
    room.game.mode_runtime = room.mode;
  }

  // Definir step e current_room_code para o host
  uctx.step = "IN_ROOM";
  uctx.current_room_code = code;

  ensureScoreCfg(room);

  // Enviar instrução simplificada no grupo
  actions.push(actionSend({ 
    channel: "group", 
    chat_id: room.screen_group_id, 
    text: "📺✨ TELÃO VINCULADO COM SUCESSO!\n\n" + roomPanelText(room) + "\n\n" + [
      "📝 Para participar, cada jogador deve:",
      "",
      "1️⃣ No privado do bot, enviar: ,ativarbot",
      "2️⃣ Depois, enviar: entrar " + room.code,
      "",
      "🎯 O host controla o jogo com comandos no grupo!"
    ].join("\n")
  }));
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

  // Debug info
  console.log("[DEBUG GROUP_CMD] roomCode:", roomCode);
  console.log("[DEBUG GROUP_CMD] room:", room ? room.code : null);
  console.log("[DEBUG GROUP_CMD] room.screen_group_id:", room?.screen_group_id);
  console.log("[DEBUG GROUP_CMD] parsed.chat_id:", parsed.chat_id);
  
  if (!room) {
    // Room not found - try to find by screen group
    const roomByGroup = Object.values(state.rooms || {}).find(r => r.screen_group_id === parsed.chat_id);
    if (roomByGroup) {
      console.log("[DEBUG GROUP_CMD] Found room by screen_group_id:", roomByGroup.code);
      actions.push(actionSend({ channel: "group", chat_id: parsed.chat_id, text: "⚠️ Comando reconhecido, mas preciso processar..." }));
    } else {
      actions.push(actionSend({ channel: "group", chat_id: parsed.chat_id, text: "⚠️ Nenhuma sala vinculada a este grupo. Use o comando no privado com o bot para criar ou entrar em uma sala." }));
      return buildOutput(state, actions, { group_cmd: "no_room_found" }, message);
    }
  }

  if (!room || !room.screen_group_id || room.screen_group_id !== parsed.chat_id) {
    actions.push(actionSend({ channel: "group", chat_id: parsed.chat_id, text: "⚠️ Este grupo não está vinculado a nenhuma sala. O host precisa criar uma sala e vinculá-la." }));
    return buildOutput(state, actions, { group_cmd: "no_room_match", cmd }, message);
  }
  if (!isHost(room, parsed.sender_chat_id)) {
    // Não é host - ignorar completamente, não responder
    return buildOutput(state, [], { group_cmd: "not_host_ignored", cmd }, message);
  }

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

  // Verificar se já existe uma sala em criação antes de criar nova
  if (c.cmd === "criar") {
    // Verificar se há salas em criação no state (já hydratado a partir do datastore)
    const stateCreatingRooms = Object.values(state.rooms || {}).filter(
      r => r.status === "CREATING" && r.host_chat_id !== sender_chat_id
    );
    
    if (stateCreatingRooms.length > 0) {
      actions.push(actionSend({ 
        channel: "private", 
        chat_id: sender_chat_id, 
        text: "⚠️ No momento, outra sala está sendo criada por outro jogador.\n\nAguarde um momento e tente novamente, ou entre em uma sala existente:\n\nDigite salas para ver as disponíveis." 
      }));
      return buildOutput(state, actions, { criar: "blocked_other_creation" }, message);
    }
  }

  const textInputSteps = new Set([
    "SET_NAME",
    "ROOM_CREATE_NAME",
    "ROOM_CREATE_PASSWORD",
    "ROOM_CREATE_VISIBILITY",
    "ROOM_CREATE_MODE",
    "ROOM_CREATE_ROUNDS",
    "ROOM_CREATE_WAIT_VINC",
    "ENTER_PASSWORD",
    "CONFIG_SET_PASSWORD",
    "CONFIG_RENAME",
    "CONFIG_ROUNDS",
    "CONFIG_QTYPES",
    "CONFIG_MAXPLAYERS",
    "CONFIG_VISIBILITY",
    "CONFIG_MODE",
    "CONFIG_ADDBOTS",
    "CONFIG_KICK",
    // Steps legados também precisam ser reconhecidos
    "CREATE_STEP_NAME",
    "CREATE_STEP_VISIBILITY",
    "CREATE_STEP_PASSWORD",
    "CREATE_STEP_MODE",
    "CREATE_STEP_ROUNDS",
    "CREATE_WAIT_VINC",
    "ROOM_START_TUTORIAL_Q",
    "ENTERING_PASSWORD",
  ]);
  
  // ANTES de converter comandos para texto, verificar comandos especiais primeiro!
  // Isso evita que "criar", "menu", etc sejam tratados como texto em SET_NAME
  
  // 处理 "criar" 命令 - 必须先于文本转换
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

  // 处理 "menu" 命令
  if (c.cmd === "menu") {
    uctx.step = "BOT_ACCESS";
    uctx.current_room_code = null;
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: lobbyMenuText() }));
    return buildOutput(state, actions, { menu: true }, message);
  }

  // 处理 "salas" 命令
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

  // 处理 "nome" 命令
  if (c.cmd === "nome") {
    const activeRoomCodeForName = uctx.current_room_code || findUserRoomCode();
    const hasActiveRoomForName = !!(activeRoomCodeForName && getRoomByCode(activeRoomCodeForName));
    const inlineName = String(c.name ?? "").trim().slice(0, 20);

    if (inlineName) {
      profile.name = inlineName;
      updatePlayerNameAcrossRooms(state, sender_chat_id, inlineName);
      uctx.step = resolvePostSetNameStep(uctx, hasActiveRoomForName);
      if (hasActiveRoomForName) uctx.current_room_code = activeRoomCodeForName;
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Nome alterado com sucesso!

🎭 Agora você é: ${inlineName}` }));
      if (hasActiveRoomForName) {
        const roomForName = getRoomByCode(activeRoomCodeForName);
        if (roomForName?.screen_group_id) {
          actions.push(actionSend({ channel: "group", chat_id: roomForName.screen_group_id, text: `🪪 ${inlineName} atualizou o nome no jogo.` }));
        }
      }
      return buildOutput(state, actions, { set_name: "ok_inline" }, message);
    }

    uctx.step_before_set_name = String(uctx.step ?? "");
    uctx.step = "SET_NAME";
    actions.push(
      actionSend({
        channel: "private",
        chat_id: sender_chat_id,
        text: `🪪 ALTERAR NOME

Seu nome atual é:
${profile.name}

Digite o novo nome que deseja usar 👇

(Máximo 20 caracteres)`,
      }),
    );
    return buildOutput(state, actions, { set_name: "prompt" }, message);
  }

  // 处理 "entrar" 命令
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
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Entrada confirmada! Você entrou na sala ${room.name}.\n\n📺 O telão desta sala já está vinculado.\n💡 Para alterar seu nome, digite: nome` }));
    } else {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Entrada confirmada! Você entrou na sala ${room.name}.\n\n⚠️ O telão ainda não foi vinculado. Aguarde o host vincular.\n💡 Para alterar seu nome, digite: nome` }));
    }

    return buildOutput(state, actions, { entrar: "ok_public", code }, message);
  }

  // 处理 "desativarbot" 命令
  if (c.cmd === "desativarbot" || (c.cmd === "text" && normalizeAnswerText(c.text) === ",desativarbot")) {
    uctx.step = "BOT_INACTIVE";
    uctx.current_room_code = null;
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🛑 Bot desativado. Para voltar a jogar, envie ,ativarbot." }));
    return buildOutput(state, actions, { deactivated: true }, message);
  }

  // 处理 "ativarbot" 命令
  if (c.cmd === "text" && normalizeAnswerText(c.text) === ",ativarbot") {
    // Se o step não existe ou não está definido, é ativação pela primeira vez
    const currentStep = uctx.step;
    const isFirstTime = !currentStep || currentStep === "BOT_INACTIVE" || currentStep === undefined || currentStep === null;
    
    if (!isFirstTime && currentStep !== "BOT_INACTIVE") {
      // Já está ativo
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

    // Primeira vez ativando o bot
    uctx.step = "BOT_ACCESS";
    uctx.current_room_code = null;

    actions.push(
      actionSend({
        channel: "private",
        chat_id: sender_chat_id,
        text: [
          "🤖✨ Bot ativado com sucesso!",
          "",
          `👤 Você está jogando como: ${profile.name}`,
          "",
          "Bem-vindo ao Servidor Oficial do Fibbage 🎉🎲",
          "Você está no Lobby — ainda não está em nenhuma sala.",
          "",
          "💡 Para alterar seu nome a qualquer momento, digite: nome",
        ].join("\n"),
      }),
    );

    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: lobbyMenuText() }));
    return buildOutput(state, actions, { activated: true }, message);
  }

  // Se o usuário está em um step que exige texto livre (SET_NAME, ROOM_CREATE_NAME, etc.),
  // converter input para texto. Mas NÃO fazer isso para steps que esperam NÚMEROS!
  const textOnlySteps = new Set([
    "SET_NAME",
    "ROOM_CREATE_NAME",
    "ROOM_CREATE_PASSWORD",
    "ENTER_PASSWORD",
    "CONFIG_SET_PASSWORD",
    "CONFIG_RENAME",
  ]);
  
  if (textOnlySteps.has(String(uctx.step ?? "")) && c.cmd !== "text") {
    c = { cmd: "text", text: String(parsed.text ?? "").trim() };
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

  // Obter room para os próximos handlers (config, jogo, etc.)
  const activeRoomCode2 = uctx.current_room_code || findUserRoomCode();
  const room = activeRoomCode2 ? getRoomByCode(activeRoomCode2) : null;

  console.log("[DEBUG] === INÍCIO DOS HANDLERS ===");
  console.log("[DEBUG] uctx.step:", uctx.step);
  console.log("[DEBUG] uctx.current_room_code:", uctx.current_room_code);
  console.log("[DEBUG] activeRoomCode2 (from findUserRoomCode):", activeRoomCode2);
  console.log("[DEBUG] room found:", room ? room.code : null);
  console.log("[DEBUG] room.status:", room?.status);
  console.log("[DEBUG] isHost(room, sender_chat_id):", room ? isHost(room, sender_chat_id) : null);
  console.log("[DEBUG] c.cmd:", c.cmd);
  console.log("[DEBUG] ========================");

  // Handler para CONFIG_RENAME - ALTERAR NOME DA SALA
  if (room && uctx.step === "CONFIG_RENAME" && isHost(room, sender_chat_id) && c.cmd === "text") {
    const newName = String(c.text ?? "").trim().slice(0, 25);
    if (!newName) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Nome inválido. Digite o nome da sala 👇" }));
      return buildOutput(state, actions, { rename: "invalid" }, message);
    }
    room.name = newName;
    afterBigEventPause(room);
    uctx.step = "ROOM_CONFIG_MENU";
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Nome da sala alterado para: ${newName}` }));
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
    return buildOutput(state, actions, { rename: "ok" }, message);
  }

  // Handler para CONFIG_VISIBILITY - ALTERAR VISIBILIDADE (vem antes de SET_NAME!)
  if (room && uctx.step === "CONFIG_VISIBILITY" && isHost(room, sender_chat_id) && c.cmd === "number") {
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

  // Handler para SET_NAME - quando usuário está alterando nome
  if (uctx.step === "SET_NAME") {
    console.log("[DEBUG] Entrou no handler SET_NAME, cmd:", c.cmd);

    if (c.cmd === "text") {
      const newName = String(c.text ?? "").trim().slice(0, 20);
      if (!newName) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Nome inválido. Digite um nome válido 👇" }));
        return buildOutput(state, actions, { set_name: "invalid" }, message);
      }
      profile.name = newName;
      updatePlayerNameAcrossRooms(state, sender_chat_id, newName);

      const activeRoomCodeForName = uctx.current_room_code || findUserRoomCode();
      const roomAfterName = activeRoomCodeForName ? getRoomByCode(activeRoomCodeForName) : null;
      uctx.step = resolvePostSetNameStep(uctx, !!roomAfterName);
      if (roomAfterName) uctx.current_room_code = activeRoomCodeForName;

      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Nome alterado com sucesso!

🎭 Agora você é: ${newName}` }));
      if (roomAfterName?.screen_group_id) {
        actions.push(actionSend({ channel: "group", chat_id: roomAfterName.screen_group_id, text: `🪪 ${newName} atualizou o nome no jogo.` }));
      }
      console.log("[DEBUG] SET_NAME completo, step restaurado para:", uctx.step);
      return buildOutput(state, actions, { set_name: "ok" }, message);
    }

    // Se recebeu comando em vez de texto no step SET_NAME, mostrar mensagem de erro
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Digite o nome que deseja usar (texto livre) 👇" }));
    return buildOutput(state, actions, { set_name: "need_text" }, message);
  }

  // Handler para ENTER_PASSWORD - quando usuário está entrando em sala com senha
  if (uctx.step === "ENTER_PASSWORD" && c.cmd === "text") {
    const code = uctx.current_room_code;
    const room = getRoomByCode(code);
    if (!room) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Erro: sala não encontrada." }));
      uctx.step = "BOT_ACCESS";
      uctx.current_room_code = null;
      return buildOutput(state, actions, { enter_password: "room_not_found" }, message);
    }
    const enteredPassword = String(c.text ?? "").trim();
    if (enteredPassword !== room.password) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "🔐 Senha incorreta. Tente novamente 👇" }));
      return buildOutput(state, actions, { enter_password: "wrong_password" }, message);
    }
    // Senha correta - entrar na sala
    ensureUserInRoom(state, sender_chat_id, code);
    uctx.step = "IN_ROOM";
    if (room.screen_group_id) {
      actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: `👤✨ ${profile.name} entrou na sala!` }));
      actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: roomPanelText(room), delay_seconds: 1 }));
      actions.push(actionSend({ channel: "private", chat_id: room.host_chat_id, text: `👥 Atualização da sala!\n\n${profile.name} entrou.\nOlhe no telão para o painel atualizado.` }));
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Entrada confirmada! Você entrou na sala ${room.name}.\n\n📺 O telão desta sala já está vinculado.\n💡 Para alterar seu nome, digite: nome` }));
    } else {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Entrada confirmada! Você entrou na sala ${room.name}.\n\n⚠️ O telão ainda não foi vinculado. Aguarde o host vincular.\n💡 Para alterar seu nome, digite: nome` }));
    }
    return buildOutput(state, actions, { entrar: "ok_private", code }, message);
  }

  // Handler para ROOM_CREATE_NAME - quando usuário está criando sala e digita o nome
  if (uctx.step === "ROOM_CREATE_NAME" && c.cmd === "text") {
    const roomCode = uctx.current_room_code;
    const room = getRoomByCode(roomCode);
    if (!room) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Erro: sala não encontrada. Digite criar para começar novamente." }));
      uctx.step = "BOT_ACCESS";
      uctx.current_room_code = null;
      return buildOutput(state, actions, { create_name: "room_not_found" }, message);
    }
    room.name = String(c.text ?? "").trim().slice(0, 25);
    if (!room.name) {
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Nome inválido. Digite o nome da sala 👇" }));
      return buildOutput(state, actions, { create_name: "invalid" }, message);
    }
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

  // Obter room para os próximos handlers
  const roomCodeForSteps = uctx.current_room_code;
  const roomForSteps = roomCodeForSteps ? getRoomByCode(roomCodeForSteps) : null;

  console.log("[DEBUG] Room code for steps:", roomCodeForSteps);
  console.log("[DEBUG] Room for steps:", roomForSteps ? roomForSteps.code : null);
  console.log("[DEBUG] uctx.step:", uctx.step);
  console.log("[DEBUG] textInputSteps.has(uctx.step):", textInputSteps.has(String(uctx.step ?? "")));

  // Handler especial para quando está esperando vinculação do telão
  if (uctx.step === "ROOM_CREATE_WAIT_VINC") {
    actions.push(actionSend({ 
      channel: "private", 
      chat_id: sender_chat_id, 
      text: "📡 Para vincular o telão, vá ao grupo e envie:\n\n`vinc " + (roomCodeForSteps || "XX") + "`\n\n(Use o código da sala que apareceu na mensagem anterior)"
    }));
    return buildOutput(state, actions, { wait_vinc: true }, message);
  }

  if (roomForSteps && uctx.step?.startsWith("ROOM_CREATE_")) {
    // Usar roomForSteps diretamente (não redeclarar room aqui para evitar TDZ com const room abaixo)
    
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

      roomForSteps.visibility = vNum === 1 ? "publica" : vNum === 2 ? "privada" : "oculta";

      if (roomForSteps.visibility === "publica") {
        roomForSteps.password = null;
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
            roomForSteps.visibility === "privada" ? "🔒 Sala definida como: Privada" : "🙈 Sala definida como: Oculta",
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

      roomForSteps.password = pass;
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

      roomForSteps.mode = c.n === 2 ? "EAY" : "CLASSIC";
      uctx.step = "ROOM_CREATE_ROUNDS";
      actions.push(
        actionSend({
          channel: "private",
          chat_id: sender_chat_id,
          text: [
            `🎮 Modo definido: ${roomForSteps.mode === "EAY" ? "EAY (Enough About You)" : "Clássico"}`,
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

      roomForSteps.rounds_total = n;
      uctx.step = "ROOM_CREATE_WAIT_VINC";
      actions.push(
        actionSend({
          channel: "private",
          chat_id: sender_chat_id,
          text: [
            `🔢 Número de rodadas definido: ${roomForSteps.rounds_total}`,
            "",
            "━━━━━━━━━━━━━━━",
            "📡 ÚLTIMO PASSO — Vincular o Telão",
            "",
            "Agora vá até o grupo que será o telão da sala e envie:",
            "",
            `vinc ${roomForSteps.code}`,
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
        uctx.step = "CONFIG_RENAME";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `📝 ALTERAR NOME DA SALA\n\nNome atual: ${room.name}\n\nDigite o novo nome 👇\n\n(Máximo 25 caracteres)` }));
        return buildOutput(state, actions, { config: "rename_prompt" }, message);
      }
      if (n === 2) {
        uctx.step = "CONFIG_ROUNDS";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `🔢 NÚMERO DE RODADAS\n\nAtual: ${room.rounds_total}\n\nDigite um número entre 1 e 10 👇` }));
        return buildOutput(state, actions, { config: "rounds_prompt" }, message);
      }
      if (n === 3) {
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
      if (n === 4) {
        uctx.step = "CONFIG_MAXPLAYERS";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `👥 MÁXIMO DE JOGADORES\n\nAtual: ${room.max_players}\n\nDigite um número entre 2 e 12 👇` }));
        return buildOutput(state, actions, { config: "max_prompt" }, message);
      }
      if (n === 5) {
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
      if (n === 6) {
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
      if (n === 7) {
        uctx.step = "CONFIG_ADDBOTS";
        const existingBots = room.players_order.filter((pid) => room.players[pid]?.is_bot).length;
        const canAdd = Math.max(0, room.max_players - room.players_order.length);
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `🤖 ADICIONAR BOTS\n\nBots atuais: ${existingBots}\nVagas disponíveis: ${canAdd}\n\nDigite a quantidade de bots que deseja adicionar (1-${canAdd}) 👇` }));
        return buildOutput(state, actions, { config: "addbots_prompt" }, message);
      }
      if (n === 8) {
        uctx.step = "CONFIG_KICK";
        const playersList = room.players_order
          .map((pid, idx) => {
            const p = room.players[pid];
            if (!p) return null;
            const isHost = pid === room.host_chat_id;
            if (isHost) return null;
            return `${idx + 1}️⃣ ${p.name}${p.is_bot ? " (bot)" : ""}`;
          })
          .filter(Boolean);
        
        if (playersList.length === 0) {
          actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Não há jogadores para expulsar (só você na sala)." }));
          uctx.step = "ROOM_CONFIG_MENU";
          actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
          return buildOutput(state, actions, { config: "kick_no_players" }, message);
        }
        
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `🚫 EXPULSAR JOGADOR\n\nSelecione quem deseja expulsar:\n\n${playersList.join("\n")}\n\n0️⃣ Cancelar\n\nDigite o número 👇` }));
        return buildOutput(state, actions, { config: "kick_prompt" }, message);
      }
      if (n === 9) {
        uctx.step = "CONFIG_END_CONFIRM";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Tem certeza que deseja encerrar a sala?\n\n1️⃣ Confirmar\n0️⃣ Cancelar\n\nDigite o número 👇" }));
        return buildOutput(state, actions, { config: "end_confirm" }, message);
      }

      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Opção inválida. Digite 0 a 9 👇" }));
      return buildOutput(state, actions, { config: "invalid" }, message);
    }

    if (uctx.step === "CONFIG_RENAME" && isHost(room, sender_chat_id) && c.cmd === "text") {
      const newName = String(c.text ?? "").trim().slice(0, 25);
      if (!newName) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Nome inválido. Digite o nome da sala 👇" }));
        return buildOutput(state, actions, { rename: "invalid" }, message);
      }
      room.name = newName;
      afterBigEventPause(room);
      uctx.step = "ROOM_CONFIG_MENU";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `✅ Nome da sala alterado para: ${newName}` }));
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
      return buildOutput(state, actions, { rename: "ok" }, message);
    }

    if (uctx.step === "CONFIG_KICK" && isHost(room, sender_chat_id)) {
      if (c.cmd === "number" && c.n === 0) {
        uctx.step = "ROOM_CONFIG_MENU";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room) }));
        return buildOutput(state, actions, { kick: "cancel" }, message);
      }
      
      const playerIdx = c.cmd === "number" ? c.n - 1 : -1;
      if (playerIdx < 0) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Digite o número do jogador que deseja expulsar 👇" }));
        return buildOutput(state, actions, { kick: "invalid" }, message);
      }
      
      const playersList = room.players_order.filter(pid => pid !== room.host_chat_id);
      if (playerIdx >= playersList.length) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Número inválido. Digite o número do jogador que deseja expulsar 👇" }));
        return buildOutput(state, actions, { kick: "invalid_index" }, message);
      }
      
      const kickedPid = playersList[playerIdx];
      const kickedPlayer = room.players[kickedPid];
      const kickedName = kickedPlayer?.name ?? "Jogador";
      const isBot = kickedPlayer?.is_bot ?? false;
      
      // Remover jogador
      delete room.players[kickedPid];
      room.players_order = room.players_order.filter(pid => pid !== kickedPid);
      delete room.game.scores[kickedPid];
      
      afterBigEventPause(room);
      uctx.step = "ROOM_CONFIG_MENU";
      
      if (isBot) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `🤖 O bot ${kickedName} foi removido da sala.` }));
      } else {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: `🚫 O jogador ${kickedName} foi expulso da sala.` }));
      }
      
      if (room.screen_group_id) {
        actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: `👋 ${kickedName} foi removido${isBot ? " (bot)" : ""} da sala pelo host.` }));
        actions.push(actionSend({ channel: "group", chat_id: room.screen_group_id, text: roomPanelText(room), delay_seconds: 1 }));
      }
      
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
      return buildOutput(state, actions, { kick: "ok" }, message);
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
      // Voltar ao menu de configurações após alterar
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
      uctx.step = "ROOM_CONFIG_MENU";
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

    if (uctx.step === "CONFIG_ADDBOTS" && isHost(room, sender_chat_id)) {
      const n = c.cmd === "number" ? c.n : c.cmd === "text" ? parseIntStrict(c.text) : null;
      if (n === null || n < 1) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Digite um número válido de bots para adicionar 👇" }));
        return buildOutput(state, actions, { addbots: "invalid" }, message);
      }
      const existingBots = room.players_order.filter((pid) => room.players[pid]?.is_bot).length;
      const canAdd = Math.max(0, room.max_players - room.players_order.length);
      const toAdd = Math.min(n, canAdd);

      if (toAdd <= 0) {
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Não é possível adicionar mais bots (sala cheia)." }));
        uctx.step = "ROOM_CONFIG_MENU";
        actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
        return buildOutput(state, actions, { addbots: "room_full" }, message);
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
      uctx.step = "ROOM_CONFIG_MENU";
      actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: configMenuText(room), delay_seconds: 0 }));
      return buildOutput(state, actions, { addbots: "ok" }, message);
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

  // Se ainda está em um fluxo de input (criação, config, etc) mas não reconheceu o comando
  if (textInputSteps.has(String(uctx.step ?? ""))) {
    // Estar em um fluxo de input - não mostrar lobby, pedir para digitar algo válido
    const stepName = uctx.step ?? "";
    let helpMsg = "⚠️ Não entendi. ";
    
    if (stepName.startsWith("ROOM_CREATE_")) {
      helpMsg += "Você está no fluxo de criação de sala. ";
      if (stepName === "ROOM_CREATE_NAME") helpMsg += "Digite o nome da sala.";
      else if (stepName === "ROOM_CREATE_VISIBILITY") helpMsg += "Digite 1, 2 ou 3.";
      else if (stepName === "ROOM_CREATE_PASSWORD") helpMsg += "Digite uma senha (mínimo 4 caracteres).";
      else if (stepName === "ROOM_CREATE_MODE") helpMsg += "Digite 1 ou 2.";
      else if (stepName === "ROOM_CREATE_ROUNDS") helpMsg += "Digite um número entre 1 e 10.";
      else if (stepName === "ROOM_CREATE_WAIT_VINC") helpMsg += "Vá ao grupo e envie: vinc XX";
    } else if (stepName.startsWith("CONFIG_")) {
      helpMsg += "Você está no menu de configuração. ";
      if (stepName === "CONFIG_RENAME") helpMsg += "Digite o novo nome da sala.";
      else if (stepName === "CONFIG_ROUNDS") helpMsg += "Digite um número entre 1 e 10.";
      else if (stepName === "CONFIG_QTYPES") helpMsg += "Digite 1, 2, 3, 4 ou 0.";
      else if (stepName === "CONFIG_MAXPLAYERS") helpMsg += "Digite um número entre 2 e 12.";
      else if (stepName === "CONFIG_VISIBILITY") helpMsg += "Digite 1, 2, 3 ou 0.";
      else if (stepName === "CONFIG_MODE") helpMsg += "Digite 1 ou 2.";
      else if (stepName === "CONFIG_ADDBOTS") helpMsg += "Digite a quantidade de bots.";
      else if (stepName === "CONFIG_KICK") helpMsg += "Digite o número do jogador.";
      else if (stepName === "CONFIG_SET_PASSWORD") helpMsg += "Digite uma senha (mínimo 4 caracteres).";
      else if (stepName === "CONFIG_END_CONFIRM") helpMsg += "Digite 1 para confirmar ou 0 para cancelar.";
    } else if (stepName === "SET_NAME") {
      helpMsg = "⚠️ Digite seu nome de jogador.";
    } else if (stepName === "ENTER_PASSWORD") {
      helpMsg = "⚠️ Digite a senha da sala.";
    } else if (stepName === "ASK_TUTORIAL") {
      helpMsg = "⚠️ Digite 1 (sim) ou 2 (não).";
    } else if (stepName === "ROOM_CONFIG_MENU") {
      helpMsg = "⚠️ Digite o número da opção (0 a 9).";
    } else if (stepName === "IN_ROOM") {
      helpMsg = "⚠️ Na sala, envie config para configurações ou iniciar para começar.";
    }
    
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: helpMsg }));
    return buildOutput(state, actions, { fallback: "in_flow" }, message);
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

  if (fallbackRoom && fallbackRoom.status !== "ENDED") {
    actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Não entendi esse comando dentro da sala.\n\nUse: config, iniciar, continuar, painel ou nome." }));
    return buildOutput(state, actions, { fallback: "in_room_no_lobby" }, message);
  }

  actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: "⚠️ Não entendi esse comando. Dá uma olhada nas opções do menu abaixo 👇" }));
  actions.push(actionSend({ channel: "private", chat_id: sender_chat_id, text: lobbyMenuText(), delay_seconds: 0 }));
  return buildOutput(state, actions, { fallback: "lobby_menu" }, message);
}

return buildOutput(state, actions, { unhandled: true, parsed }, message);
