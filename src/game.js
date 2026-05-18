(function () {
  "use strict";

  const STARTING_CHIPS = 15;
  const STARTING_GOLD = 0;
  const BASE_BUST_PENALTY = 6;
  const BASE_GOLD_REWARD = 3;
  const RUNE_LIMIT = 3;
  const REFRESH_COST = 3;
  const BEST_KEY = "twenty-one-rogue-best";
  const FIRST_PLAY_KEY = "twenty-one-rogue-first-played";
  const TUTORIAL_DONE_KEY = "twenty-one-rogue-tutorial-finished";

  // ---------------- 教程内容定义 ----------------
  const tutorialSteps = [
    { title: "欢迎来到 21点回廊", text: "你的目标是尽可能多地通过层数。\n如果你的【筹码】在结算时降为 0，游戏就会结束。" },
    { title: "基础操作", text: "【摸牌】：抽一张牌，如果抽牌后超过 21 点（爆牌）将直接被扣除 6 点筹码，并结束该回合。\n【停牌】：结束本回合。扣除 (21-手牌点数) 点筹码。\n【弃牌】：主动丢弃不需要的手牌（每回合限一次）。" },
    { title: "层数与关底", text: "游戏以【层】为单位，每层包含 3 个回合。右上角的圆点代表当前进度。\n第 3 战是【关底】，会带有极其危险的负面特效。你可以将鼠标悬停在右上角红色的关底圆点上，提前查看它的削弱效果！" },
    { title: "商店与构筑", text: "每个回合结算后都会进入【商店阶段】。\n你可以消耗金币购买【符文】（全局被动增益）或【画笔】（修改、强化牌库里的卡牌），构筑出独一无二的流派！" }
  ];
  // ---------------------------------------------

  const suits = [
    { key: "spades", label: "黑桃", symbol: "♠", color: "black" },
    { key: "hearts", label: "红桃", symbol: "♥", color: "red" },
    { key: "clubs", label: "梅花", symbol: "♣", color: "black" },
    { key: "diamonds", label: "方片", symbol: "♦", color: "red" },
  ];

  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  // ---------------- 词条池定义 ----------------
  const weakDebuffs = [
    { id: "add-jqk", name: "人头攒动", desc: "向抽牌堆塞入J、Q、K各一张。" },
    { id: "add-8s", name: "八方受敌", desc: "向抽牌堆塞入4张8。" },
    { id: "add-7s", name: "七零八落", desc: "向弃牌堆塞入5张7。" },
    { id: "option-disabled", name: "失效选项", desc: "本回合最多抽 2 张牌，不可以弃牌。" },
    { id: "bust-damage", name: "猛烈反噬", desc: "本回合爆牌惩罚+3。" },
    { id: "stand-damage-x2", name: "双倍惩罚", desc: "本回合停牌造成的惩罚乘2。" },
    { id: "stand-under-18", name: "胆怯之罪", desc: "本回合停牌时点数若<17，惩罚乘3。" },
    { id: "lose-gold-not-21", name: "极致贪婪", desc: "本回合停牌时点数若不为21，失去全部金币。" },
  ];

  const strongDebuffs = [
    { id: "no-tags", name: "标签脱落", desc: "本回合所有标签（尖刺/奇巧/护盾/镀金/图腾等）失效。" },
    { id: "no-runes", name: "符文禁锢", desc: "本回合所有符文失效。" },
    { id: "add-jqk+", name: "人头攒动+", desc: "向抽牌堆塞入J、Q、K各 2 张。" },
    { id: "add-8s+", name: "八方受敌+", desc: "向抽牌堆塞入8张8。" },
    { id: "add-7s+", name: "七零八落+", desc: "向弃牌堆塞入10张7。" },
    { id: "max-1-draw", name: "手足无措", desc: "本回合最多抽 1 张牌，不可以弃牌。" },
    { id: "bust-damage+", name: "猛烈反噬+", desc: "本回合爆牌惩罚+8。" },
    { id: "stand-damage-x3", name: "三倍惩罚", desc: "本回合停牌造成的惩罚乘3。" },
    { id: "19-20-21", name: "精准头目", desc: "本回合在19，20，21点停牌不扣筹码，否则（包括爆牌）失去8点筹码。" },
  ];

  const ultimateDebuffs = [
    { id: "20-21", name: "终极头目1", desc: "本回合在20，21点停牌不扣筹码，否则（包括爆牌）失去{n}点筹码。" },
    { id: "21", name: "终极头目2", desc: "本回合在21点停牌不扣筹码，否则（包括爆牌）失去{n}点筹码。" },
  ];

  const keywordTooltips = {
    "尖刺": "可以同时视为自身点数或 1 点。",
    "镀金": "停牌结算时若留在手牌，每张额外产出 2 金币。",
    "奇巧": "抽到时，本回合弃牌次数 +1。",
    "护盾": "抽到时，本回合停牌造成的筹码损失减少 1 点。",
    "图腾": "在回合中主动弃掉此牌时，获得 1 点筹码。",
    "缝合": "可以同时视为两张牌对应的点数。"
  };

  function injectTooltips(text) {
    let html = escapeHtml(text);
    for (const [word, desc] of Object.entries(keywordTooltips)) {
      const regex = new RegExp(word, "g");
      html = html.replace(regex, `<span class="keyword-tooltip" data-tooltip="${desc}">${word}</span>`);
    }
    return html;
  }

  function getBossDebuffData(id) {
    const all = weakDebuffs.concat(strongDebuffs, ultimateDebuffs);
    return all.find(function (b) { return b.id === id; });
  }

  function getDebuffDesc(id) {
    const data = getBossDebuffData(id);
    if (!data) return "";
    let text = data.desc;
    if (state.ultimateCounters[id] !== undefined) {
      text = text.replace("{n}", state.ultimateCounters[id]);
    }
    return text;
  }

  const elements = {
    roundStat: document.querySelector("#roundStat"),
    chipsStat: document.querySelector("#chipsStat"),
    goldStat: document.querySelector("#goldStat"),
    bestStat: document.querySelector("#bestStat"),
    phaseLabel: document.querySelector("#phaseLabel"),
    shopPhaseLabel: document.querySelector("#shopPhaseLabel"),
    roundMessage: document.querySelector("#roundMessage"),
    shopMessage: document.querySelector("#shopMessage"),
    handValue: document.querySelector("#handValue"),
    handCards: document.querySelector("#handCards"),
    roundView: document.querySelector("#roundView"),
    shopView: document.querySelector("#shopView"),
    animationLayer: document.querySelector("#animationLayer"),
    drawCount: document.querySelector("#drawCount"),
    discardCount: document.querySelector("#discardCount"),
    shopDrawCount: document.querySelector("#shopDrawCount"),
    shopDiscardCount: document.querySelector("#shopDiscardCount"),
    runeSlots: document.querySelector("#runeSlots"),
    rewardPreview: document.querySelector("#rewardPreview"),
    suitStat: document.querySelector("#suitStat"), 
    runeHint: document.querySelector("#runeHint"),
    ownedRunes: document.querySelector("#ownedRunes"),
    shopItems: document.querySelector("#shopItems"),
    gameLog: document.querySelector("#gameLog"),
    modalOverlay: document.querySelector("#modalOverlay"),
    modalEyebrow: document.querySelector("#modalEyebrow"),
    modalTitle: document.querySelector("#modalTitle"),
    modalText: document.querySelector("#modalText"),
    modalContent: document.querySelector("#modalContent"),
    modalActions: document.querySelector("#modalActions"),
    modalCloseButton: document.querySelector("[data-modal-close]"),
    gameOverDialog: document.querySelector("#gameOverDialog"),
    gameOverSummary: document.querySelector("#gameOverSummary"),
  };

  let nextCardId = 1;
  let settleTimer = 0;

  function createTutorialState() {
    return {
      active: false,
      awaiting: "",
      offerReason: "",
      shopTargetType: "",
      shopTargetId: "",
      grantedGold: 0,
      locked: false,
    };
  }

  const state = {
    phase: "playing",
    floor: 1,  
    stage: 1,  
    chips: STARTING_CHIPS,
    gold: STARTING_GOLD,
    best: loadBestRound(),
    bottlePrice: 3, 
    removedSuits: [],
    activeSuits: [],
    drawPile: [],
    discardPile: [],
    hand: [],
    runes: [],
    shop: { runes: [], brushes: [], bought: [] },
    roundFlags: { discardsUsed: 0, draws: 0, extraDiscards: 0, shieldReduction: 0 },
    upcomingBossDebuffs: [],
    activeBossDebuffs: [], 
    ultimateCounters: { "20-21": 10, "21": 5 },
    lastResult: null,
    modal: null,
    motionQueue: [],
    log: [],
    tutorial: createTutorialState(),
  };

  const runeCatalog = [
    { id: "golden-charm", name: "黄金护符", price: 8, effect: "爆牌扣除的筹码-1。" },
    { id: "gambler-brew", name: "赌徒特酿", price: 9, effect: "每回合弃牌次数+1。" },
    { id: "clockwork-boots", name: "发条靴", price: 7, effect: "停牌时如果正好20点，不扣除筹码。" },
    { id: "coin-rose", name: "铸币玫瑰", price: 7, effect: "每回合结束后额外获得1金币。" },
    { id: "felt-padding", name: "软垫桌角", price: 7, effect: "停牌造成的筹码损失最多为5。" },
    { id: "jade-ring", name: "翡翠指环", price: 7, effect: "停牌达到18点或以上时，额外获得1金币。" },
    { id: "cardboard-box", name: "小纸箱", price: 6, effect: "每当你在回合中弃牌时，有10%概率获得1点筹码。" },
    { id: "perfect-strike", name: "完美打击", price: 8, effect: "以21点停牌时，有(60-当前层数*3)%概率获得1点筹码。" },
    { id: "alchemist", name: "炼金术士", price: 7, effect: "如果你本回合弃牌了，结算时额外获得2金币。" },
    { id: "thorned-armor", name: "荆棘护甲", price: 8, effect: "停牌结算时，手牌中如果有“尖刺”牌，失去的筹码数量-1。" },
    { id: "frankenstein", name: "缝合怪", price: 8, effect: "停牌结算时，手牌中如果有“缝合”牌，获得2金币。" },
    { id: "draw-more", name: "好牌多抓", price: 5, effect: "如果在点数大于等于20点时选择“摸牌”，获得1点筹码。" },
    { id: "excellent-intuition", name: "优秀直觉", price: 10, effect: "当抽牌堆为空，手牌点数视作21。" },
    { id: "perfect-ten", name: "十全十美", price: 10, effect: "当手牌数量等于10，手牌点数视作21。" },
    { id: "coupon", name: "优惠券", price: 9, effect: "你商店的“瓶中墨汁”售价始终为5金币。" },
    { id: "hanged-man", name: "吊人", price: 9, effect: "你每从抽牌堆永久移除一张牌，获得1点筹码。" },
    { id: "hanged-man-reversed", name: "吊人（倒置）", price: 6, effect: "你每从弃牌堆永久移除一张牌，获得1点筹码。" },
    { id: "failure", name: "失败", price: 6, effect: "没有任何用。" },
  ];

  const brushCatalog = [
    makeBrush("draw-remove", "抽牌削除", "抽牌堆", "remove", 7, 4, "从抽牌堆随机8张牌中选择最多4张移除。"),
    makeBrush("draw-add", "抽牌添色", "抽牌堆", "add", 5, 4, "从随机8张新牌中选择最多4张加入抽牌堆。"),
    makeBrush("draw-spike", "抽牌尖刺", "抽牌堆", "spike", 9, 1, "从抽牌堆随机8张牌中选择最多1张附上尖刺。"),
    makeBrush("draw-merge", "抽牌缝合", "抽牌堆", "merge", 10, 2, "从抽牌堆随机8张牌中选择2张缝合点数。"),
    makeBrush("discard-remove", "弃牌削除", "弃牌堆", "remove", 8, 4, "从弃牌堆随机8张牌中选择最多4张移除。"),
    makeBrush("discard-add", "弃牌添色", "弃牌堆", "add", 3, 4, "从随机8张新牌中选择最多4张加入弃牌堆。"),
    makeBrush("discard-spike", "弃牌尖刺", "弃牌堆", "spike", 7, 1, "从弃牌堆随机8张牌中选择最多1张附上尖刺。"),
    makeBrush("discard-merge", "弃牌缝合", "弃牌堆", "merge", 8, 2, "从弃牌堆随机8张牌中选择2张缝合点数。"),
    makeBrush("draw-gilded", "镀金墨水", "抽牌堆", "instant-tag-gilded", 6, 0, "为抽牌堆中随机1张牌附上“镀金”标签。"),
    makeBrush("draw-quirky", "紫色墨水", "抽牌堆", "instant-tag-quirky", 6, 0, "为抽牌堆中随机1张牌附上“奇巧”标签。"),
    makeBrush("draw-shield", "抽牌护盾", "抽牌堆", "tag-shield", 7, 1, "从抽牌堆随机8张牌中选择1张附上“护盾”标签。"),
    makeBrush("discard-shield", "弃牌护盾", "弃牌堆", "tag-shield", 6, 1, "从弃牌堆随机8张牌中选择1张附上“护盾”标签。"),
    makeBrush("draw-totem", "抽牌图腾", "抽牌堆", "tag-totem", 7, 1, "从抽牌堆随机8张牌中选择1张附上“图腾”标签。"),
    makeBrush("discard-totem", "弃牌图腾", "弃牌堆", "tag-totem", 6, 1, "从弃牌堆随机8张牌中选择1张附上“图腾”标签。"),
    makeBrush("draw-clone-discard", "镜中之影", "抽牌堆", "clone-to-discard", 7, 1, "从抽牌堆随机8张牌中选择1张，添加其复制牌到弃牌堆。"),
    makeBrush("discard-clone-draw", "影中之镜", "弃牌堆", "clone-to-draw", 8, 1, "从弃牌堆随机8张牌中选择1张，添加其复制牌到抽牌堆。"),
    makeBrush("instant-erase-untagged", "牌组消除", "无", "instant-erase-untagged", 8, 0, "随机从牌库移除4张没有标签的牌。"),
    makeBrush("instant-bottle", "瓶中墨汁", "无", "instant-bottle", 3, 0, "购买时，获得5筹码。将随机三张新牌放入弃牌堆。每次购买时，下次售价+1。"),
  ];

  function makeBrush(id, name, targetLabel, operation, price, maxPick, description) {
    return { id, name, target: id.startsWith("draw") ? "draw" : "discard", targetLabel, operation, price, maxPick, description };
  }

  function loadBestRound() {
    const saved = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(saved) ? saved : 0;
  }

  function saveBestRound() {
    window.localStorage.setItem(BEST_KEY, String(state.best));
  }

  function isFirstPlay() {
    return !window.localStorage.getItem(FIRST_PLAY_KEY);
  }

  function markFirstPlaySeen() {
    window.localStorage.setItem(FIRST_PLAY_KEY, "true");
  }

  function shouldOfferTutorial(reason) {
    if (reason === "restart") return true;
    return reason === "boot" && isFirstPlay();
  }

  function showTutorialModal(options) {
    state.modal = {
      kind: "tutorial",
      title: options.title,
      text: options.text,
      actions: options.actions || [],
      hideClose: options.hideClose !== false,
    };
  }

  function showTutorialOffer(reason) {
    const isRestart = reason === "restart";
    state.tutorial = createTutorialState();
    state.tutorial.offerReason = reason;
    showTutorialModal({
      title: isRestart ? "再来一局" : "新手教程",
      text: isRestart
        ? "新的一个局已经准备好了。当然，你也可以再看一遍教程。"
        : "检测到你是第一次游玩。要不要直接在对局里跟着教程熟悉一遍？",
      actions: [
        { action: "tutorial-decline", label: "直接开始" },
        { action: "tutorial-accept", label: "开始教程"},
      ],
    });
  }

  function createTutorialCard(rank, offset) {
    const pool = state.activeSuits.length > 0 ? state.activeSuits : suits;
    return makeCard(rank, pool[offset % pool.length], "tutorial");
  }

  function prepareTutorialOpeningRound() {
    window.clearTimeout(settleTimer);
    nextCardId = 1;
    state.phase = "playing";
    state.floor = 1;
    state.stage = 1;
    state.chips = STARTING_CHIPS;
    state.gold = STARTING_GOLD;
    state.bottlePrice = 3;
    state.drawPile = createHalfDeck();
    state.discardPile = [];
    state.hand = [
      createTutorialCard("4", 0),
      createTutorialCard("7", 1),
    ];
    state.runes = [];
    state.shop = { runes: [], brushes: [], bought: [] };
    state.roundFlags = { discardsUsed: 0, draws: 0, extraDiscards: 0, shieldReduction: 0 };
    state.upcomingBossDebuffs = generateUpcomingDebuffs(state.floor);
    state.activeBossDebuffs = [];
    state.ultimateCounters = { "20-21": 10, "21": 5 };
    state.lastResult = null;
    state.motionQueue = [];
    state.log = [];
    state.tutorial = createTutorialState();
    state.tutorial.active = true;

    state.drawPile.push(createTutorialCard("A", 2));
    state.drawPile.push(createTutorialCard("9", 3));
    state.drawPile.push(createTutorialCard("5", 4));

    addLog("教程已开始，先跟着引导熟悉这一回合。");
  }

  function getTutorialPrompt(reason) {
    if (reason === "hit") {
      showTutorialModal({
        title: "目标和失败条件",
        text: "你的目标是完成尽可能多的回合，打得越远越好。\n而筹码降到 0 时这局就结束了。 \n\n现在先点击【摸牌】，抽一张牌试试。",
        actions: [
          { action: "tutorial-ready-hit", label: "开始练习", primary: true },
        ],
      });
      return;
    }

    if (reason === "discard") {
      showTutorialModal({
        title: "先试试弃牌",
        text: "【弃牌】可以把当前不想要的手牌丢进弃牌堆。\n默认每回合只能主动弃牌 1 次，现在点击【弃牌】试试。\n\n如果你的抽牌堆空了，弃牌堆会被洗回抽牌堆。",
        actions: [
          { action: "tutorial-ready-discard", label: "去弃一张", primary: true },
        ],
      });
      return;
    }

    if (reason === "stand") {
      showTutorialModal({
        title: "再试试停牌",
        text: "【停牌】会立刻结束这个回合，然后按照你与 21 点的差距扣除筹码。\n注意，如果你【摸牌】后手牌点数超过 21 点，会“爆牌”——扣除 6 点筹码并立即结束回合。\n所以，在合适的时候【停牌】是很重要的！\n\n现在点击【停牌】，我们一起进入商店。",
        actions: [
          { action: "tutorial-ready-stand", label: "去停牌", primary: true },
        ],
      });
      return;
    }

    if (reason === "shop") {
      const topUpText = state.tutorial.grantedGold > 0
        ? "\n\n为了让你能立刻试试，我帮你补了 " + state.tutorial.grantedGold + " 金币。"
        : "";
      showTutorialModal({
        title: "进入商店",
        text: "每个回合结算后都会进商店。\n【符文】是这局持续生效的被动增益，【画笔】则是用来修改、强化牌库的道具。\n先买下一件符文，看看商店怎么用。" + topUpText,
        actions: [
          { action: "tutorial-ready-shop", label: "去购物", primary: true },
        ],
      });
      return;
    }

    if (reason === "boss") {
      showTutorialModal({
        title: "一层有三回合",
        text: "一层由 3 个回合组成，第 3 个回合就是关底战斗。\n关底战斗有一个强大的负面特效。\n右上角【牌局】框内的圆点代表这层的进度，把鼠标移到红色圆圈，就能提前看到关底特效。",
        actions: [
          { action: "tutorial-ready-boss", label: "我来看看", primary: true },
        ],
      });
      return;
    }

    if (reason === "finish") {
      showTutorialModal({
        title: "教程完成",
        text: "你已经走完了核心流程：摸牌、弃牌、停牌，以及商店和关底提示的看法。\n现在就可以直接继续这局了。",
        actions: [
          { action: "tutorial-finish", label: "继续这局", primary: true },
        ],
      });
    }
  }

  function delayTutorialPrompt(reason) {
    state.tutorial.locked = true;
    window.setTimeout(function () {
      state.tutorial.locked = false;
      getTutorialPrompt(reason);
      render();
    }, 1000);
  }

  function tutorialAllowsAction(action) {
    if (!state.tutorial.active) return true;
    if (state.tutorial.locked) return false;
    if (state.tutorial.awaiting === "hit") return action === "hit";
    if (state.tutorial.awaiting === "discard-button") return action === "discard";
    if (state.tutorial.awaiting === "stand") return action === "stand";
    return false;
  }

  function tutorialAllowsShopPurchase(type, id) {
    if (!state.tutorial.active) return true;
    if (state.tutorial.locked) return false;
    if (state.tutorial.awaiting !== "shop-buy") return true;
    return state.tutorial.shopTargetType === type && state.tutorial.shopTargetId === id;
  }

  function getTutorialHint() {
    if (!state.tutorial.active) return "";
    if (state.tutorial.awaiting === "hit") return "教程：先点击【摸牌】抽 1 张牌。";
    if (state.tutorial.awaiting === "discard-button") return "教程：现在试试【弃牌】。";
    if (state.tutorial.awaiting === "discard-select") {
      return state.modal && state.modal.selectedIds.length > 0
        ? "教程：点击确认，完成这次弃牌。"
        : "教程：先选中一张要丢掉的手牌。";
    }
    if (state.tutorial.awaiting === "stand") return "教程：点击【停牌】进入结算。";
    if (state.tutorial.awaiting === "shop-buy") return "教程：先买下高亮的符文。";
    if (state.tutorial.awaiting === "boss-hover") return "教程：把鼠标移到右上角的红色圆点上。";
    return "";
  }

  function clearTutorialFocus() {
    document.querySelectorAll(".is-tutorial-focus").forEach(function (node) {
      node.classList.remove("is-tutorial-focus");
    });
  }

  function syncTutorialFocus() {
    clearTutorialFocus();
    if (!state.tutorial.active || state.tutorial.locked) return;

    let selector = "";
    if (state.tutorial.awaiting === "hit") selector = '[data-action="hit"]';
    else if (state.tutorial.awaiting === "discard-button") selector = '[data-action="discard"]';
    else if (state.tutorial.awaiting === "discard-select") {
      selector = state.modal && state.modal.selectedIds.length > 0 ? "[data-modal-confirm]" : "[data-select-card]";
    }
    else if (state.tutorial.awaiting === "stand") selector = '[data-action="stand"]';
    else if (state.tutorial.awaiting === "shop-buy") {
      selector = state.tutorial.shopTargetType === "rune"
        ? '[data-buy-rune="' + state.tutorial.shopTargetId + '"]'
        : '[data-buy-brush="' + state.tutorial.shopTargetId + '"]';
    }
    else if (state.tutorial.awaiting === "boss-hover") selector = '[data-tutorial-id="boss-node"]';

    if (!selector) return;
    document.querySelectorAll(selector).forEach(function (node) {
      node.classList.add("is-tutorial-focus");
      const shopItem = node.closest(".shop-item");
      if (shopItem) shopItem.classList.add("is-tutorial-focus");
    });
  }

  function setTutorialShopTarget() {
    const targetId = state.shop.runes[0];
    const targetRune = getRune(targetId);
    state.tutorial.shopTargetType = "rune";
    state.tutorial.shopTargetId = targetId || "";
    state.tutorial.grantedGold = 0;

    if (targetRune && state.gold < targetRune.price) {
      state.tutorial.grantedGold = targetRune.price - state.gold;
      state.gold = targetRune.price;
      addLog("教程补给：获得 " + state.tutorial.grantedGold + " 金币，足够先试试购买。");
    }
  }

  function startTutorial() {
    prepareTutorialOpeningRound();
    getTutorialPrompt("hit");
    render();
  }

  function finishTutorial() {
    window.localStorage.setItem(TUTORIAL_DONE_KEY, "true");
    state.tutorial = createTutorialState();
    state.modal = null;
    render();
  }

  function handleTutorialAction(action) {
    if (action === "tutorial-decline") {
      state.tutorial = createTutorialState();
      state.modal = null;
      render();
      return;
    }

    if (action === "tutorial-accept") {
      startTutorial();
      return;
    }

    if (action === "tutorial-ready-hit") {
      state.modal = null;
      state.tutorial.awaiting = "hit";
      render();
      return;
    }

    if (action === "tutorial-ready-discard") {
      state.modal = null;
      state.tutorial.awaiting = "discard-button";
      render();
      return;
    }

    if (action === "tutorial-ready-stand") {
      state.modal = null;
      state.tutorial.awaiting = "stand";
      render();
      return;
    }

    if (action === "tutorial-ready-shop") {
      state.modal = null;
      state.tutorial.awaiting = "shop-buy";
      render();
      return;
    }

    if (action === "tutorial-ready-boss") {
      state.modal = null;
      state.tutorial.awaiting = "boss-hover";
      render();
      return;
    }

    if (action === "tutorial-finish") {
      finishTutorial();
    }
  }

  function makeCard(rank, suit, source) {
    return { id: source + "-" + nextCardId++, rank, suit, tags: [], mergeRanks: [] };
  }

  function cloneFreshCard(card, source) {
    return makeCard(card.rank, card.suit, source);
  }

  function createHalfDeck() {
    const removed = shuffle(suits).slice(0, 2);
    const removedKeys = removed.map(function (suit) { return suit.key; });
    const active = suits.filter(function (suit) { return !removedKeys.includes(suit.key); });
    const deck = [];
    for (const suit of active) {
      for (const rank of ranks) { deck.push(makeCard(rank, suit, "standard")); }
    }
    state.removedSuits = removed;
    state.activeSuits = active;
    return shuffle(deck);
  }

  function createFreshPalette(count) {
    const pool = [];
    for (const suit of suits) {
      for (const rank of ranks) { pool.push(makeCard(rank, suit, "paint-preview")); }
    }
    return sample(pool, count);
  }

  function shuffle(cards) {
    const copy = cards.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = current;
    }
    return copy;
  }

  function sample(cards, count) {
    return shuffle(cards).slice(0, Math.min(count, cards.length));
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function generateUpcomingDebuffs(floor) {
    const debuffs = [];
    if (floor <= 3) {
      debuffs.push(randomItem(weakDebuffs).id);
    } else if (floor >= 4 && floor <= 6) {
      debuffs.push(randomItem(strongDebuffs).id);
    } else if (floor >= 7 && floor <= 9) {
      debuffs.push(randomItem(ultimateDebuffs).id);
      debuffs.push(randomItem(weakDebuffs).id);
    } else {
      debuffs.push(randomItem(ultimateDebuffs).id);
      debuffs.push(randomItem(strongDebuffs).id);
    }
    return debuffs;
  }

  function hasDebuff(id) {
    return state.activeBossDebuffs.includes(id);
  }

  function hasActiveTag(card, tag) {
    if (hasDebuff("no-tags") && ["spike", "quirky", "shield", "gilded", "totem"].includes(tag)) {
      return false;
    }
    return card.tags.includes(tag);
  }

  function resetGame(reason) {
    window.clearTimeout(settleTimer);
    nextCardId = 1;
    state.phase = "playing";
    state.floor = 1;
    state.stage = 1;
    state.chips = STARTING_CHIPS;
    state.gold = STARTING_GOLD;
    state.bottlePrice = 3;
    state.drawPile = createHalfDeck();
    state.discardPile = [];
    state.hand = [];
    state.runes = [];
    state.shop = { runes: [], brushes: [], bought: [] };
    state.roundFlags = { discardsUsed: 0, draws: 0, extraDiscards: 0, shieldReduction: 0 };
    state.ultimateCounters = { "20-21": 10, "21": 5 };
    state.lastResult = null;
    state.modal = null;
    state.motionQueue = [];
    state.log = [];
    state.activeBossDebuffs = [];
    state.upcomingBossDebuffs = generateUpcomingDebuffs(state.floor);
    state.tutorial = createTutorialState();

    addLog("新的牌局开始，初始牌库保留" + state.activeSuits.map(function(s){return s.label}).join("、") + "。");
    beginRound();

    if (shouldOfferTutorial(reason || "manual")) {
      if (reason === "boot") markFirstPlaySeen();
      showTutorialOffer(reason || "manual");
      render();
    }
  }

  function beginRound() {
    state.phase = "playing";
    state.lastResult = null;
    state.shop = { runes: [], brushes: [], bought: [] };
    state.roundFlags = { discardsUsed: 0, draws: 0, extraDiscards: 0, shieldReduction: 0 }; 
    state.hand = [];
    state.activeBossDebuffs = [];

    const isBossRound = (state.stage === 3);
    if (isBossRound) {
      state.activeBossDebuffs = state.upcomingBossDebuffs.slice();
      const names = state.activeBossDebuffs.map(id => getBossDebuffData(id).name).join(" + ");
      addLog("💀 关底降临！触发削弱：" + names);
      applyBossStartEffects();
    } else {
      addLog("第 " + state.floor + " 层，第 " + state.stage + " 战开始，抽取两张牌。");
    }

    const drawn = drawIntoHand(2);
    queueAnimation("draw", drawn);
    render();
  }

  function applyBossStartEffects() {
    if (hasDebuff("add-jqk")) {
      state.drawPile.push(makeCard("J", randomItem(suits), "boss"));
      state.drawPile.push(makeCard("Q", randomItem(suits), "boss"));
      state.drawPile.push(makeCard("K", randomItem(suits), "boss"));
      state.drawPile = shuffle(state.drawPile);
      addLog("牌堆被污染，加入了J、Q、K各一张。");
    } 
    if (hasDebuff("add-jqk+")) {
      for(let i=0; i<2; i++) {
        state.drawPile.push(makeCard("J", randomItem(suits), "boss"));
        state.drawPile.push(makeCard("Q", randomItem(suits), "boss"));
        state.drawPile.push(makeCard("K", randomItem(suits), "boss"));
      }
      state.drawPile = shuffle(state.drawPile);
      addLog("牌堆深度污染，加入了J、Q、K各2张。");
    }
    if (hasDebuff("add-8s")) {
      for (let i = 0; i < 4; i++) state.drawPile.push(makeCard("8", randomItem(suits), "boss"));
      state.drawPile = shuffle(state.drawPile);
      addLog("牌堆中被强行加入了4张8。");
    }
    if (hasDebuff("add-8s+")) {
      for (let i = 0; i < 8; i++) state.drawPile.push(makeCard("8", randomItem(suits), "boss"));
      state.drawPile = shuffle(state.drawPile);
      addLog("牌堆中被强行加入了8张8。");
    }
    if (hasDebuff("add-7s")) {
      for (let i = 0; i < 5; i++) state.discardPile.push(makeCard("7", randomItem(suits), "boss"));
      addLog("弃牌堆中被塞入了5张7。");
    }
    if (hasDebuff("add-7s+")) {
      for (let i = 0; i < 10; i++) state.discardPile.push(makeCard("7", randomItem(suits), "boss"));
      addLog("弃牌堆中被塞入了10张7。");
    }
  }

  function onCardDrawn(card) {
    if (hasActiveTag(card, "quirky")) {
      state.roundFlags.extraDiscards += 1;
      addLog("✨ 抽到“奇巧”牌，本回合可弃牌次数+1！");
    }
    if (hasActiveTag(card, "shield")) {
      state.roundFlags.shieldReduction += 1;
      addLog("🛡️ 抽到“护盾”牌，本回合停牌惩罚抵消1点！");
    }
  }

  function drawIntoHand(count) {
    let drawn = 0;
    for (let index = 0; index < count; index += 1) {
      const card = drawCard();
      if (card) {
        state.hand.push(card);
        onCardDrawn(card);
        drawn += 1;
      }
    }
    return drawn;
  }

  function drawCard() {
    if (state.drawPile.length === 0 && state.discardPile.length > 0) {
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [];
      addLog("抽牌堆为空，洗牌补充。");
      queueAnimation("shuffle", 3);
    }
    return state.drawPile.pop() || null;
  }

  function queueAnimation(type, count) {
    if (count > 0) state.motionQueue.push({ type: type, count: count });
  }

  function animateCards(type, count) {
    if (!elements.animationLayer || count <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let index = 0; index < count; index += 1) {
      const card = document.createElement("div");
      card.className = "flight-card " + type;
      card.style.animationDelay = index * 70 + "ms";
      elements.animationLayer.appendChild(card);
      window.setTimeout(function () { card.remove(); }, 960 + index * 70);
    }
  }

  function flushMotionQueue() {
    const queue = state.motionQueue.splice(0);
    for (const motion of queue) animateCards(motion.type, motion.count);
  }

  function moveHandToDiscard() {
    if (state.hand.length > 0) {
      state.discardPile.push.apply(state.discardPile, state.hand);
      state.hand = [];
    }
  }

  function hit() {
    if (state.phase !== "playing" || state.modal) return;
    
    if (hasDebuff("max-1-draw") && state.roundFlags.draws >= 1) {
       addLog("削弱限制：手足无措，已达最大抽牌次数！"); return;
    }
    if (hasDebuff("option-disabled") && state.roundFlags.draws >= 2) {
       addLog("削弱限制：失效选项，已达最大抽牌次数！"); return;
    }

    if (getHandValue(state.hand).total >= 20 && hasRune("draw-more")) {
      state.chips += 1;
      addLog("🃏 【好牌多抓】生效，冒险摸牌获得1点筹码！");
    }

    const card = drawCard();
    if (!card) {
      addLog("没有可抽的牌，本回合被迫停牌。");
      stand();
      return;
    }

    state.hand.push(card);
    onCardDrawn(card);
    state.roundFlags.draws += 1;
    queueAnimation("draw", 1);
    addLog("摸到" + formatCard(card) + "。");

    if (getHandValue(state.hand).total > 21) {
      handleBust();
      return;
    }

    if (state.tutorial.active && state.tutorial.awaiting === "hit") {
      state.tutorial.awaiting = "";
      delayTutorialPrompt("discard");
    }
    render();
  }

  function stand() {
    if (state.phase !== "playing" || state.modal) return;
    finishRound("stand");
  }

  function handleBust() { finishRound("bust"); }

  function getMaxDiscards() {
    return 1 + (hasRune("gambler-brew") ? 1 : 0) + state.roundFlags.extraDiscards;
  }

  function startDiscard() {
    if (state.phase !== "playing" || state.modal || state.hand.length === 0) return;
    if (hasDebuff("option-disabled") || hasDebuff("max-1-draw")) return; 
    if (state.roundFlags.discardsUsed >= getMaxDiscards()) return;
    
    state.modal = {
      kind: "discard", title: "主动弃牌", text: "选择一张手牌弃掉。本回合还可弃牌" + (getMaxDiscards() - state.roundFlags.discardsUsed) + "次。",
      selectedIds: [], candidates: state.hand.slice(), minPick: 1, maxPick: 1,
    };
    if (state.tutorial.active && state.tutorial.awaiting === "discard-button") {
      state.tutorial.awaiting = "discard-select";
      state.modal.hideClose = true;
      state.modal.text = "选中一张手牌，然后确认将它丢进弃牌堆。";
    }
    render();
  }

  function executeDiscard() {
    const modal = state.modal;
    if (!modal || modal.kind !== "discard" || !isModalSelectionValid(modal)) return;
    const card = removeCardFromHand(modal.selectedIds[0]);
    if (card) {
      state.discardPile.push(card);
      state.roundFlags.discardsUsed += 1;
      addLog("主动弃掉" + formatCard(card) + "。");

      if (hasRune("cardboard-box") && Math.random() < 0.1) {
        state.chips += 1;
        addLog("📦 【小纸箱】生效，获得了1点筹码！");
      }
      
      if (hasActiveTag(card, "totem")) {
        state.chips += 1;
        addLog("🃏 主动弃掉图腾牌，获得了1点筹码！");
      }
    }
    state.modal = null;
    if (state.tutorial.active && state.tutorial.awaiting === "discard-select") {
      state.tutorial.awaiting = "";
      delayTutorialPrompt("stand");
    }
    render();
  }

  function getBasePenalty(kind, total) {
    if (hasDebuff("21")) {
      return (kind === "stand" && total === 21) ? 0 : state.ultimateCounters["21"];
    }
    if (hasDebuff("20-21")) {
      return (kind === "stand" && (total === 20 || total === 21)) ? 0 : state.ultimateCounters["20-21"];
    }
    if (hasDebuff("19-20-21")) {
      return (kind === "stand" && total >= 19 && total <= 21) ? 0 : 8;
    }

    if (kind === "bust") {
      return Math.max(1, BASE_BUST_PENALTY - runeCount("golden-charm"));
    } else {
      let p = Math.max(0, 21 - total);
      if (hasRune("clockwork-boots") && total === 20) p = 0;
      if (hasRune("felt-padding")) p = Math.min(p, 5);
      if (hasRune("thorned-armor") && state.hand.some(c => hasActiveTag(c, "spike"))) {
        p = Math.max(0, p - 1);
      }
      p = Math.max(0, p - state.roundFlags.shieldReduction);
      return p;
    }
  }

  function calculateStandPenalty(total) {
    let penalty = getBasePenalty("stand", total);
    let isOverride = hasDebuff("21") || hasDebuff("20-21") || hasDebuff("19-20-21");
    if (!isOverride) {
      if (hasDebuff("stand-damage-x3")) penalty *= 3;
      else if (hasDebuff("stand-damage-x2")) penalty *= 2;
      
      if (hasDebuff("stand-under-18") && total < 17) penalty *= 3;
    }
    return penalty;
  }

  function finishRound(kind) {
    const value = getHandValue(state.hand);
    let penalty;
    let resultLabel;

    let isOverride = hasDebuff("21") || hasDebuff("20-21") || hasDebuff("19-20-21");

    if (kind === "stand") {
      penalty = calculateStandPenalty(value.total);
      resultLabel = "停牌";
      
      if (value.total === 21 && hasRune("perfect-strike")) {
        const prob = Math.max(0, 60 - state.floor * 3) / 100;
        if (Math.random() < prob) {
          state.chips += 1;
          addLog("🎯 【完美打击】生效，获得了1点筹码！");
        }
      }
    } else {
      penalty = getBasePenalty("bust", value.total);
      resultLabel = "爆牌";
      if (!isOverride) {
        if (hasDebuff("bust-damage+")) penalty += 8;
        else if (hasDebuff("bust-damage")) penalty += 3;
      }
    }

    state.chips = Math.max(0, state.chips - penalty);
    state.lastResult = { kind: kind, total: value.total, penalty: penalty, goldReward: 0 };

    if (state.chips <= 0) {
      addLog(resultLabel + "结算，扣除" + penalty + "筹码。筹码归零。");
      beginSettlement("gameover");
      return;
    }

    if (hasDebuff("lose-gold-not-21") && kind === "stand" && value.total !== 21) {
      state.gold = 0;
      addLog("关底贪婪诅咒触发：点数非21，失去了所有的金币！");
    }
    if (hasDebuff("lose-runes-under-20") && kind === "stand" && value.total < 20) {
      state.runes = [];
      addLog("关底碎盾诅咒触发：点数不足20，失去了所有的符文！");
    }

    if (state.stage === 3) {
      if (hasDebuff("20-21")) state.ultimateCounters["20-21"] += 1;
      if (hasDebuff("21")) state.ultimateCounters["21"] += 1;
      
      const healAmount = Math.max(1, 10 - (state.floor - 1) * 2);
      state.chips += healAmount;
      addLog("🎉 击破第" + state.floor + "层！恢复" + healAmount + "枚筹码。");

      state.upcomingBossDebuffs = generateUpcomingDebuffs(state.floor + 1);
    }

    const goldReward = getGoldReward(kind, value.total, penalty);
    state.gold += goldReward;
    state.lastResult.goldReward = goldReward;
    addLog(resultLabel + "结算，扣除" + penalty + "筹码，获得" + goldReward + "金币。");

    updateBestRound(state.floor);
    if (state.tutorial.active && state.tutorial.awaiting === "stand") {
      state.tutorial.awaiting = "shop-arrival";
    }
    beginSettlement("shop");
  }

  function beginSettlement(nextPhase) {
    state.phase = "settling";
    render();
    animateCards("discard", state.hand.length);

    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(function () {
      moveHandToDiscard();
      if (nextPhase === "gameover") {
        state.phase = "gameover";
        updateBestRound(state.floor);
      } else {
        state.phase = "shop";
        generateShop();
        if (state.tutorial.active && state.tutorial.awaiting === "shop-arrival") {
          state.tutorial.awaiting = "";
          setTutorialShopTarget();
          delayTutorialPrompt("shop");
        }
      }
      render();
    }, 620);
  }

  function getGoldReward(kind, total, penalty) {
    let reward = BASE_GOLD_REWARD + Math.max(0, 4 - Math.min(4, penalty));
    if (kind === "stand" && total === 21) reward += 1;
    if (kind === "bust") reward = Math.max(BASE_GOLD_REWARD, reward - 1);
    if (hasRune("coin-rose")) reward += 1;
    if (kind === "stand" && total >= 18 && hasRune("jade-ring")) reward += 1;
    
    if (hasRune("alchemist") && state.roundFlags.discardsUsed > 0) reward += 2;
    if (kind === "stand" && hasRune("frankenstein") && state.hand.some(c => c.mergeRanks.length > 0)) {
      reward += 2;
    }
    if (kind === "stand") {
      const gildedCount = state.hand.filter(c => hasActiveTag(c, "gilded")).length;
      reward += gildedCount * 2;
    }

    return reward;
  }

  function updateBestRound(floor) {
    if (floor > state.best) {
      state.best = floor;
      saveBestRound();
    }
  }

  function generateShop() {
    const availableRunes = runeCatalog.filter(function (rune) { return !state.runes.includes(rune.id); });
    state.shop = {
      runes: sample(availableRunes, 2).map(function (rune) { return rune.id; }),
      brushes: sample(brushCatalog, 2).map(function (brush) { return brush.id; }),
      bought: [],
    };
  }

  function refreshShop() {
    if (state.phase !== "shop" || state.gold < REFRESH_COST) return;
    state.gold -= REFRESH_COST;
    generateShop();
    addLog("支付" + REFRESH_COST + "金币刷新商店。");
    render();
  }

  function buyRune(runeId) {
    if (state.phase !== "shop" || state.shop.bought.includes(runeId)) return;
    const rune = getRune(runeId);
    if (!rune || state.gold < rune.price || state.runes.length >= RUNE_LIMIT || state.runes.includes(runeId)) return;
    state.gold -= rune.price;
    state.runes.push(runeId);
    state.shop.bought.push(runeId);
    if (state.tutorial.active && state.tutorial.awaiting === "shop-buy" && state.tutorial.shopTargetType === "rune" && state.tutorial.shopTargetId === runeId) {
      state.tutorial.awaiting = "";
      delayTutorialPrompt("boss");
    }
    addLog("买入符文：" + rune.name + "。");
    render();
  }

  function sellRune(runeId) {
    const index = state.runes.indexOf(runeId);
    const rune = getRune(runeId);
    if (state.phase !== "shop" || index === -1 || !rune) return;
    const refund = Math.max(1, Math.floor(rune.price / 2));
    state.runes.splice(index, 1);
    state.gold += refund;
    addLog("出售符文：" + rune.name + "，获得" + refund + "金币。");
    render();
  }

  function getBrushPrice(brushId) {
    if (brushId === "instant-bottle") {
      return hasRune("coupon") ? 5 : state.bottlePrice;
    }
    const brush = getBrush(brushId);
    return brush ? brush.price : 999;
  }

  function startBrushPurchase(brushId) {
    if (state.phase !== "shop" || state.shop.bought.includes(brushId)) return;
    const brush = getBrush(brushId);
    const currentPrice = getBrushPrice(brushId);
    if (!brush || state.gold < currentPrice || !canUseBrush(brush)) return;
    
    if (brush.maxPick === 0) {
      state.gold -= currentPrice;
      applyBrush(brush, [], []);
      state.shop.bought.push(brush.id);
      render();
      return;
    }

    const candidates = getBrushCandidates(brush);
    const isMerge = brush.operation === "merge";
    state.modal = {
      kind: "brush", brushId: brush.id, title: brush.name, text: brush.description,
      selectedIds: [], candidates: candidates, minPick: isMerge ? 2 : 1, maxPick: brush.maxPick,
    };
    render();
  }

  function confirmBrush() {
    const modal = state.modal;
    if (!modal || modal.kind !== "brush") return;
    const brush = getBrush(modal.brushId);
    const currentPrice = getBrushPrice(modal.brushId);
    if (!brush || state.gold < currentPrice || !isModalSelectionValid(modal)) return;
    state.gold -= currentPrice;
    applyBrush(brush, modal.selectedIds, modal.candidates);
    state.shop.bought.push(brush.id);
    state.modal = null;
    render();
  }

  function applyBrush(brush, selectedIds, candidates) {
    if (brush.operation === "instant-tag-gilded") {
      if (state.drawPile.length > 0) {
        const target = randomItem(state.drawPile);
        if (!target.tags.includes("gilded")) target.tags.push("gilded");
        addLog("使用" + brush.name + "，为抽牌堆中的一张牌附上了“镀金”。");
      } else addLog("抽牌堆为空，" + brush.name + "挥空了。");
      return;
    }
    if (brush.operation === "instant-tag-quirky") {
      if (state.drawPile.length > 0) {
        const target = randomItem(state.drawPile);
        if (!target.tags.includes("quirky")) target.tags.push("quirky");
        addLog("使用" + brush.name + "，为抽牌堆中的一张牌附上了“奇巧”。");
      } else addLog("抽牌堆为空，" + brush.name + "挥空了。");
      return;
    }
    if (brush.operation === "instant-erase-untagged") {
      let untagged = [];
      state.drawPile.forEach(function(c) { if (c.tags.length === 0) untagged.push({card: c, pile: "draw"}); });
      state.discardPile.forEach(function(c) { if (c.tags.length === 0) untagged.push({card: c, pile: "discard"}); });
      let toRemove = sample(untagged, 4);
      let removedDraw = 0, removedDiscard = 0;
      for (let item of toRemove) {
        if (item.pile === "draw") {
          const idx = state.drawPile.findIndex(function(c) { return c.id === item.card.id; });
          if (idx !== -1) { state.drawPile.splice(idx, 1); removedDraw++; }
        } else {
          const idx = state.discardPile.findIndex(function(c) { return c.id === item.card.id; });
          if (idx !== -1) { state.discardPile.splice(idx, 1); removedDiscard++; }
        }
      }
      addLog("使用" + brush.name + "，移除了" + toRemove.length + "张无标签牌。");
      
      if (removedDraw > 0 && hasRune("hanged-man")) {
        state.chips += removedDraw;
        addLog("吊人生效，获得" + removedDraw + "点筹码。");
      }
      if (removedDiscard > 0 && hasRune("hanged-man-reversed")) {
        state.chips += removedDiscard;
        addLog("吊人（倒置）生效，获得" + removedDiscard + "点筹码。");
      }
      return;
    }
    if (brush.operation === "instant-bottle") {
      state.chips += 5;
      const validSuits = state.activeSuits.length > 0 ? state.activeSuits : suits;
      for(let i = 0; i < 3; i++) {
        state.discardPile.push(makeCard(randomItem(ranks), randomItem(validSuits), "brush"));
      }
      state.bottlePrice += 1;
      addLog("使用" + brush.name + "，获得了5点筹码并将3张随机新牌加入了弃牌堆。");
      return;
    }

    const pile = getTargetPile(brush.target);
    const selectedCards = candidates.filter(function (card) { return selectedIds.includes(card.id); });

    if (brush.operation === "add") {
      for (const card of selectedCards) pile.push(cloneFreshCard(card, "paint"));
      addLog("使用" + brush.name + "，向" + brush.targetLabel + "加入" + selectedCards.length + "张牌。");
      return;
    }
    if (brush.operation === "remove") {
      const removed = removeCardsByIds(pile, selectedIds);
      addLog("使用" + brush.name + "，从" + brush.targetLabel + "移除" + removed.length + "张牌。");
      if (brush.target === "draw" && hasRune("hanged-man") && removed.length > 0) {
        state.chips += removed.length;
        addLog("吊人生效，获得" + removed.length + "点筹码。");
      }
      if (brush.target === "discard" && hasRune("hanged-man-reversed") && removed.length > 0) {
        state.chips += removed.length;
        addLog("吊人（倒置）生效，获得" + removed.length + "点筹码。");
      }
      return;
    }
    if (brush.operation === "spike") {
      for (const id of selectedIds) {
        const card = pile.find(function (entry) { return entry.id === id; });
        if (card && !card.tags.includes("spike")) card.tags.push("spike");
      }
      addLog("使用" + brush.name + "，为" + selectedIds.length + "张牌附上尖刺。");
      return;
    }
    if (brush.operation === "tag-shield") {
      for (const id of selectedIds) {
        const card = pile.find(function (entry) { return entry.id === id; });
        if (card && !card.tags.includes("shield")) card.tags.push("shield");
      }
      addLog("使用" + brush.name + "，为" + selectedIds.length + "张牌附上护盾。");
      return;
    }
    if (brush.operation === "tag-totem") {
      for (const id of selectedIds) {
        const card = pile.find(function (entry) { return entry.id === id; });
        if (card && !card.tags.includes("totem")) card.tags.push("totem");
      }
      addLog("使用" + brush.name + "，为" + selectedIds.length + "张牌附上图腾。");
      return;
    }
    if (brush.operation === "clone-to-discard" || brush.operation === "clone-to-draw") {
      for (const id of selectedIds) {
        const card = pile.find(function (entry) { return entry.id === id; });
        if (card) {
          const clone = JSON.parse(JSON.stringify(card));
          clone.id = "clone-" + nextCardId++; 
          if (brush.operation === "clone-to-discard") {
            state.discardPile.push(clone);
          } else {
            state.drawPile.push(clone);
            state.drawPile = shuffle(state.drawPile);
          }
        }
      }
      addLog("使用" + brush.name + "，成功制作了复制牌。");
      return;
    }
    if (brush.operation === "merge" && selectedIds.length === 2) {
      const firstIndex = pile.findIndex(function (card) { return card.id === selectedIds[0]; });
      const secondIndex = pile.findIndex(function (card) { return card.id === selectedIds[1]; });
      if (firstIndex !== -1 && secondIndex !== -1) {
        const first = pile[firstIndex];
        const second = pile[secondIndex];
        addMergeRank(first, second.rank);
        for (const rank of second.mergeRanks) addMergeRank(first, rank);
        for (const tag of second.tags) {
          if (!first.tags.includes(tag)) first.tags.push(tag);
        }
        pile.splice(secondIndex, 1);
        addLog("使用" + brush.name + "，将" + formatCard(second) + "缝合入" + formatCard(first) + "。");
      }
    }
  }

  function addMergeRank(card, rank) {
    if (!card.mergeRanks.includes(rank)) card.mergeRanks.push(rank);
  }

  function removeCardsByIds(pile, ids) {
    const removed = [];
    for (const id of ids) {
      const index = pile.findIndex(function (card) { return card.id === id; });
      if (index !== -1) removed.push(pile.splice(index, 1)[0]);
    }
    return removed;
  }

  function getBrushCandidates(brush) {
    if (brush.operation === "add") return createFreshPalette(8);
    return sample(getTargetPile(brush.target), 8);
  }

  function canUseBrush(brush) {
    if (brush.operation === "add" || brush.operation.startsWith("instant-")) return true;
    const count = getTargetPile(brush.target).length;
    return brush.operation === "merge" ? count >= 2 : count >= 1;
  }

  function getTargetPile(target) { return target === "draw" ? state.drawPile : state.discardPile; }

  function nextRound() {
    if (state.phase !== "shop" || state.modal) return;
    moveHandToDiscard();
    
    if (state.stage === 3) {
      state.floor += 1;
      state.stage = 1;
    } else {
      state.stage += 1;
    }

    beginRound();
  }

  function removeCardFromHand(cardId) {
    const index = state.hand.findIndex(function (card) { return card.id === cardId; });
    if (index === -1) return null;
    return state.hand.splice(index, 1)[0];
  }

  function cancelModal() { 
    if (state.modal && state.modal.kind === "tutorial") return; // 拦截教程弹窗的关闭操作
    state.modal = null; 
    render(); 
  }

  function openPileViewer(target) {
    const pile = getTargetPile(target);
    const title = target === "draw" ? "抽牌堆" : "弃牌堆";
    
    const sortedCandidates = pile.slice().sort(function (a, b) {
      const rankA = ranks.indexOf(a.rank);
      const rankB = ranks.indexOf(b.rank);
      if (rankA !== rankB) return rankA - rankB; 
      
      const suitA = suits.findIndex(function (s) { return s.key === a.suit.key; });
      const suitB = suits.findIndex(function (s) { return s.key === b.suit.key; });
      return suitA - suitB;
    });

    const textHint = target === "draw" ? "（已按点数排序隐藏真实顺序）" : "";
    state.modal = {
      kind: "pile", title: title, text: title + "共有" + pile.length + "张牌。" + textHint,
      candidates: sortedCandidates, selectedIds: [], minPick: 0, maxPick: 0,
    };
    render();
  }

  function toggleModalCard(cardId) {
    const modal = state.modal;
    if (!modal || !["brush", "discard"].includes(modal.kind)) return;
    if (modal.selectedIds.includes(cardId)) {
      modal.selectedIds = modal.selectedIds.filter(function (id) { return id !== cardId; });
      render();
      return;
    }
    if (modal.selectedIds.length >= modal.maxPick) {
      if (modal.maxPick === 1) modal.selectedIds = [cardId];
      render();
      return;
    }
    modal.selectedIds.push(cardId);
    render();
  }

  function isModalSelectionValid(modal) {
    return modal.selectedIds.length >= modal.minPick && modal.selectedIds.length <= modal.maxPick;
  }

  function getHandValue(cards) {
    let paths = [{ total: 0, path: [] }];
    for (const card of cards) {
      const options = cardValueOptions(card);
      const nextPaths = [];
      for (const p of paths) {
        for (const opt of options) {
          nextPaths.push({ total: p.total + opt, path: p.path.concat(opt) });
        }
      }
      const uniquePaths = new Map();
      for (const np of nextPaths) {
        if (!uniquePaths.has(np.total)) uniquePaths.set(np.total, np);
      }
      paths = Array.from(uniquePaths.values());
    }

    const safePaths = paths.filter(function (p) { return p.total <= 21; });
    let bestPath;
    if (safePaths.length > 0) {
      bestPath = safePaths.reduce(function (a, b) { return a.total > b.total ? a : b; });
    } else if (paths.length > 0) {
      bestPath = paths.reduce(function (a, b) { return a.total < b.total ? a : b; });
    } else {
      bestPath = { total: 0, path: [] };
    }
    
    const result = {
      total: bestPath.total,
      options: paths.map(function (p) { return p.total; }).sort(function (a, b) { return a - b; }),
      path: bestPath.path
    };

    if ((hasRune("excellent-intuition") && state.drawPile.length === 0) || 
        (hasRune("perfect-ten") && cards.length === 10)) {
      result.total = 21;
      if (!result.options.includes(21)) {
        result.options.push(21);
        result.options.sort(function (a, b) { return a - b; });
      }
    }

    return result;
  }

  function cardValueOptions(card) {
    let values = rankValueOptions(card.rank);
    for (const rank of card.mergeRanks) values = values.concat(rankValueOptions(rank));
    if (hasActiveTag(card, "spike")) {
      values.push(1);
    }
    return uniqueNumbers(values);
  }

  function rankValueOptions(rank) {
    if (rank === "A") return [1, 11];
    if (["J", "Q", "K"].includes(rank)) return [10];
    return [Number(rank)];
  }

  function uniqueNumbers(values) {
    return Array.from(new Set(values)).filter(function (value) { return Number.isFinite(value); });
  }

  function hasRune(runeId) {
    if (hasDebuff("no-runes")) return false;
    return state.runes.includes(runeId);
  }

  function runeCount(runeId) {
    if (hasDebuff("no-runes")) return 0;
    return state.runes.filter(function (id) { return id === runeId; }).length;
  }

  function getRune(runeId) {
    return runeCatalog.find(function (rune) { return rune.id === runeId; });
  }

  function getBrush(brushId) {
    return brushCatalog.find(function (brush) { return brush.id === brushId; });
  }

  function formatCard(card) {
    return card.suit.label + card.rank + getCardTagText(card);
  }

  function getCardTagText(card) {
    const tags = [];
    if (card.tags.includes("spike")) tags.push("尖刺");
    if (card.tags.includes("gilded")) tags.push("镀金");
    if (card.tags.includes("quirky")) tags.push("奇巧");
    if (card.tags.includes("shield")) tags.push("护盾");
    if (card.tags.includes("totem")) tags.push("图腾");
    if (card.mergeRanks.length > 0) tags.push("缝合" + [card.rank].concat(card.mergeRanks).join("/"));
    return tags.length > 0 ? "（" + tags.join("，") + "）" : "";
  }

  function addLog(message) {
    state.log.unshift(message);
    state.log = state.log.slice(0, 10);
  }

  function renderBossProgressBar() {
    let displayFloor = state.floor;
    let displayStage = state.stage;
    if (state.phase === "shop" || state.phase === "settling" || state.phase === "gameover") {
      displayStage += 1;
      if (displayStage > 3) {
        displayStage = 1;
        displayFloor += 1;
      }
    }
    
    const healAmount = Math.max(1, 10 - (displayFloor - 1) * 2);
    const distance = 3 - displayStage;
    const isBossActive = (distance === 0 && state.phase === "playing");
    const debuffIds = isBossActive ? state.activeBossDebuffs : state.upcomingBossDebuffs;
    const debuffNames = debuffIds.map(id => getBossDebuffData(id).name).join(" + ");
    const debuffDescs = debuffIds.map(id => getDebuffDesc(id)).join(" ");
    
    const tooltipText = `削弱：${debuffNames}\n(${debuffDescs})\n\n击破恢复：${healAmount} 筹码`;

    let circlesHtml = "";
    for (let i = 1; i <= 3; i++) {
      const isBoss = (i === 3);
      const isPast = (i < displayStage);
      const isCurrent = (i === displayStage);
      
      let cssClass = "stage-node";
      if (isBoss) cssClass += " is-boss";
      if (isPast) cssClass += " is-past";
      if (isCurrent) cssClass += " is-current";

      const tooltipAttr = isBoss ? ` data-boss-tooltip="${escapeHtml(tooltipText)}" data-tutorial-id="boss-node"` : "";
      
      circlesHtml += `<div class="${cssClass}"${tooltipAttr}></div>`;
    }

    return `
      <div style="display:flex; flex-direction:column; gap:8px; align-items:center;">
        <div style="color:var(--gold); font-size:0.85rem; font-weight:bold;">第 ${displayFloor} 层进度</div>
        <div class="stage-track">
          ${circlesHtml}
        </div>
      </div>
    `;
  }

  function setActionState(action, enabled, subText) {
    const button = document.querySelector('[data-action="' + action + '"]');
    if (!button) return;
    button.disabled = !enabled;

    if (subText !== undefined) {
      if (!button.dataset.origText) {
        button.dataset.origText = button.textContent.trim();
      }
      if (subText) {
        button.innerHTML = escapeHtml(button.dataset.origText) + '<br><span style="font-size:0.75em; font-weight:normal; opacity:0.85; line-height:1.2;">' + escapeHtml(subText) + '</span>';
      } else {
        button.textContent = button.dataset.origText;
      }
    }
  }

  function render() {
    const value = getHandValue(state.hand);
    const isPlaying = state.phase === "playing" && !state.modal;
    const isShop = state.phase === "shop" && !state.modal;
    const showingShop = state.phase === "shop";

    const feltEl = document.querySelector('.felt');
    const isBossActive = state.stage === 3 && state.phase === "playing";
    
    if (feltEl) {
      if (isBossActive) {
        feltEl.classList.add('is-boss-active');
        let banner = document.getElementById('boss-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'boss-banner';
          banner.className = 'boss-debuff-banner';
          const handZone = document.querySelector('.hand-zone');
          if (handZone) handZone.insertBefore(banner, handZone.firstChild);
        }
        const names = state.activeBossDebuffs.map(id => getBossDebuffData(id).name).join(" + ");
        const descs = state.activeBossDebuffs.map(id => getDebuffDesc(id)).join(" ");
        banner.innerHTML = `⚠️ 关底削弱生效中：${names} <span>${descs}</span>`;
      } else {
        feltEl.classList.remove('is-boss-active');
        const banner = document.getElementById('boss-banner');
        if (banner) banner.remove();
      }
    }

    elements.roundStat.textContent = state.floor + " 层";
    elements.chipsStat.textContent = String(state.chips);
    elements.goldStat.textContent = String(state.gold);
    elements.bestStat.textContent = state.best + " 层";
    elements.handValue.textContent = String(value.total);
    elements.drawCount.textContent = String(state.drawPile.length);
    elements.discardCount.textContent = String(state.discardPile.length);
    if (elements.shopDrawCount) elements.shopDrawCount.textContent = String(state.drawPile.length);
    if (elements.shopDiscardCount) elements.shopDiscardCount.textContent = String(state.discardPile.length);
    elements.suitStat.innerHTML = renderBossProgressBar();

    elements.phaseLabel.textContent = getPhaseLabel();
    const tutorialHint = getTutorialHint();
    elements.roundMessage.textContent = tutorialHint || getRoundMessage(value);
    elements.shopMessage.textContent = tutorialHint || getRoundMessage(value);
    elements.roundView.hidden = showingShop;
    elements.shopView.hidden = !showingShop;
    elements.handCards.innerHTML = state.hand.map(function (card, index) { return renderCard(card, value.path[index]); }).join("");
    elements.ownedRunes.innerHTML = renderOwnedRunes();
    elements.shopItems.innerHTML = renderShopItems();
    elements.gameLog.innerHTML = state.log.map(function (entry) { return "<li>" + escapeHtml(entry) + "</li>"; }).join("");

    const hitDisabled = (hasDebuff("max-1-draw") && state.roundFlags.draws >= 1) || (hasDebuff("option-disabled") && state.roundFlags.draws >= 2);
    const discardsLeft = getMaxDiscards() - state.roundFlags.discardsUsed;
    const discardText = "剩" + discardsLeft + "次";
    const currentPenalty = calculateStandPenalty(value.total);
    const penaltyText = currentPenalty === 0 ? "无损失" : "失去" + currentPenalty + "筹码";
    const canDiscard = discardsLeft > 0 && state.hand.length > 0 && !hasDebuff("max-1-draw") && !hasDebuff("option-disabled");

    setActionState("hit", isPlaying && !hitDisabled && tutorialAllowsAction("hit"));
    setActionState("discard", isPlaying && canDiscard && tutorialAllowsAction("discard"), discardText);
    setActionState("stand", isPlaying && tutorialAllowsAction("stand"), penaltyText);
    setActionState("next", isShop && !state.tutorial.active);
    setActionState("refresh", isShop && state.gold >= REFRESH_COST && !state.tutorial.active);

    renderModal();
    renderGameOver();
    syncTutorialFocus();
    flushMotionQueue();
  }

  function renderCard(card, activeValue) {
    const colorClass = card.suit.color === "red" ? "red" : "black";

    if (card.mergeRanks.length > 0) {
      const rankLeft = card.rank;
      const rankRight = card.mergeRanks[0];
      const leftVals = rankValueOptions(rankLeft);
      const rightVals = rankValueOptions(rankRight);

      let leftActive = true;
      let rightActive = true;

      if (activeValue !== undefined && activeValue !== null) {
        const isSpikeActive = hasActiveTag(card, "spike") && activeValue === 1 && !leftVals.includes(1) && !rightVals.includes(1);
        leftActive = !isSpikeActive && leftVals.includes(activeValue);
        rightActive = !isSpikeActive && !leftActive && rightVals.includes(activeValue);
        if (!leftActive && !rightActive && !isSpikeActive) leftActive = true;
      }

      const leftClass = leftActive ? "card-half is-active" : "card-half";
      const rightClass = rightActive ? "card-half is-active" : "card-half";
      const spikeActiveBadge = (activeValue === 1) ? " is-active" : "";

      let overlayBadges = [];
      if (hasActiveTag(card, "spike")) overlayBadges.push('<span class="card-badge' + spikeActiveBadge + '">尖刺</span>');
      if (hasActiveTag(card, "gilded")) overlayBadges.push('<span class="card-badge">镀金</span>');
      if (hasActiveTag(card, "quirky")) overlayBadges.push('<span class="card-badge">奇巧</span>');
      if (hasActiveTag(card, "shield")) overlayBadges.push('<span class="card-badge">护盾</span>');
      if (hasActiveTag(card, "totem")) overlayBadges.push('<span class="card-badge">图腾</span>');
      if (hasDebuff("no-tags") && (card.tags.includes("spike") || card.tags.includes("gilded") || card.tags.includes("quirky") || card.tags.includes("shield") || card.tags.includes("totem"))) {
         overlayBadges.push('<span class="card-badge" style="background:#555; text-decoration:line-through;">封印</span>');
      }

      const overlayHtml = overlayBadges.length > 0 ? '<div class="card-tags overlay-tag">' + overlayBadges.join("") + '</div>' : '';

      return (
        '<div class="playing-card is-merged ' + colorClass + '">' +
          '<div class="' + leftClass + '"><div class="card-corner"><span>' + escapeHtml(rankLeft) + '</span><span>' + card.suit.symbol + '</span></div><div class="card-suit">' + card.suit.symbol + '</div></div>' +
          '<div class="card-stitch"></div>' +
          '<div class="' + rightClass + '"><div class="card-corner bottom"><span>' + escapeHtml(rankRight) + '</span><span>' + card.suit.symbol + '</span></div><div class="card-suit">' + card.suit.symbol + '</div></div>' +
          overlayHtml +
        '</div>'
      );
    }

    const badges = getCardBadges(card).map(function (badge) {
      if (hasDebuff("no-tags") && ["尖刺", "镀金", "奇巧", "护盾", "图腾"].includes(badge)) {
        return '<span class="card-badge" style="background:#555; text-decoration:line-through;">' + escapeHtml(badge) + "</span>";
      }
      const isActive = (badge === "尖刺" && activeValue === 1) ? " is-active" : "";
      return '<span class="card-badge' + isActive + '">' + escapeHtml(badge) + "</span>";
    }).join("");

    const tagHtml = badges ? '<div class="card-tags">' + badges + '</div>' : '<div class="card-tags"></div>';

    return (
      '<div class="playing-card ' + colorClass + '">' +
        '<div class="card-corner"><span>' + escapeHtml(card.rank) + '</span><span>' + card.suit.symbol + '</span></div>' +
        '<div class="card-suit">' + card.suit.symbol + '</div>' +
        tagHtml +
        '<div class="card-corner bottom"><span>' + escapeHtml(card.rank) + '</span><span>' + card.suit.symbol + '</span></div>' +
      '</div>'
    );
  }

  function getCardBadges(card) {
    const badges = [];
    if (card.tags.includes("spike")) badges.push("尖刺");
    if (card.tags.includes("gilded")) badges.push("镀金");
    if (card.tags.includes("quirky")) badges.push("奇巧");
    if (card.tags.includes("shield")) badges.push("护盾");
    if (card.tags.includes("totem")) badges.push("图腾");
    if (card.mergeRanks.length > 0) badges.push("缝合");
    return badges;
  }

  function renderOwnedRunes() {
    if (state.runes.length === 0) return '<div class="empty-state">还没有符文。</div>';
    
    const isRunesDisabled = hasDebuff("no-runes");
    const disabledStyle = isRunesDisabled ? ' style="opacity:0.4; filter:grayscale(1);"' : '';

    return state.runes.map(function (runeId) {
      const rune = getRune(runeId);
      const refund = Math.max(1, Math.floor(rune.price / 2));
      return (
        '<article class="rune-card"' + disabledStyle + '>' +
          '<div><h3>' + escapeHtml(rune.name) + (isRunesDisabled ? ' (被封印)' : '') + '</h3><p>' + injectTooltips(rune.effect) + '</p></div>' +
          '<button class="mini-button" type="button" data-sell-rune="' + rune.id + '">卖 ' + refund + '</button>' +
        "</article>"
      );
    }).join("");
  }

  function renderShopItems() {
    if (state.phase !== "shop") return '<div class="shop-closed">本回合结算后，商店会在这里打开。</div>';
    const runeItems = state.shop.runes.map(renderRuneShopItem).join("");
    const brushItems = state.shop.brushes.map(renderBrushShopItem).join("");
    return '<div class="shop-group"><h3>符文</h3>' + runeItems + "</div>" + '<div class="shop-group"><h3>画笔</h3>' + brushItems + "</div>";
  }

  function renderRuneShopItem(runeId) {
    const rune = getRune(runeId);
    const bought = state.shop.bought.includes(rune.id);
    const owned = state.runes.includes(rune.id);
    const full = state.runes.length >= RUNE_LIMIT;
    const canBuy = state.gold >= rune.price && !bought && !owned && !full && tutorialAllowsShopPurchase("rune", rune.id);
    const buttonText = bought || owned ? "已拥有" : full ? "槽满" : "购买";

    return renderShopCard({
      title: rune.name, badge: "符文", description: rune.effect, price: rune.price,
      action: 'data-buy-rune="' + rune.id + '"', buttonText: buttonText, disabled: !canBuy, bought: bought || owned,
    });
  }

  function renderBrushShopItem(brushId) {
    const brush = getBrush(brushId);
    const currentPrice = getBrushPrice(brushId);
    const bought = state.shop.bought.includes(brush.id);
    const canBuy = state.gold >= currentPrice && !bought && canUseBrush(brush) && tutorialAllowsShopPurchase("brush", brush.id);
    const buttonText = bought ? "已使用" : "使用";

    return renderShopCard({
      title: brush.name, badge: "画笔", description: brush.description, price: currentPrice,
      action: 'data-buy-brush="' + brush.id + '"', buttonText: buttonText, disabled: !canBuy, bought: bought,
    });
  }

  function renderShopCard(options) {
    const className = options.bought ? "shop-item is-bought" : "shop-item";
    return (
      '<article class="' + className + '">' +
        '<div class="shop-item-head">' + "<h4>" + escapeHtml(options.title) + "</h4>" + '<span class="shop-badge">' + escapeHtml(options.badge) + "</span>" + "</div>" +
        "<p>" + injectTooltips(options.description) + "</p>" +
        '<div class="shop-item-foot">' + '<span class="price">' + options.price + "金币</span>" +
          '<button class="game-button" type="button" ' + options.action + (options.disabled ? " disabled" : "") + ">" + escapeHtml(options.buttonText) + "</button>" +
        "</div>" +
      "</article>"
    );
  }

  function getPhaseLabel() {
    if (state.phase === "settling") return "结算中";
    if (state.phase === "shop") return "商店阶段";
    if (state.phase === "gameover") return "游戏结束";
    return "摸牌阶段";
  }

  function getRoundMessage(value) {
    if (state.phase === "settling" && state.lastResult) {
      const result = state.lastResult.kind === "bust" ? "爆牌" : "停牌";
      return result + "结算：" + state.lastResult.total + "点，扣除" + state.lastResult.penalty + "筹码，手牌进入弃牌堆。";
    }
    if (state.phase === "shop" && state.lastResult) {
      const result = state.lastResult.kind === "bust" ? "爆牌" : "停牌";
      return result + "结算：" + state.lastResult.total + "点，扣除" + state.lastResult.penalty + "筹码，获得" + state.lastResult.goldReward + "金币。";
    }
    if (state.phase === "gameover") return "筹码归零，本局结束。";
    if (value.total === 21) return "正好21点，可以停牌拿到零损失。";
    if (value.total > 21) return "超过21点。";
    return "距离21点还差" + Math.max(0, 21 - value.total) + "点。";
  }

  function renderModal() {
    if (!state.modal) { elements.modalOverlay.hidden = true; return; }
    const modal = state.modal;
    elements.modalOverlay.hidden = false;
    if (elements.modalCloseButton) {
      elements.modalCloseButton.hidden = !!modal.hideClose;
    }
    elements.modalEyebrow.textContent = modal.kind === "pile" ? "牌堆" : modal.kind === "brush" ? "画笔" : modal.kind === "tutorial" ? "新手教程" : "弃牌";
    elements.modalTitle.textContent = modal.title;
    elements.modalText.textContent = modal.kind === "tutorial" ? "" : modal.text;
    elements.modalContent.innerHTML = renderModalContent(modal);
    elements.modalActions.innerHTML = renderModalActions(modal);
  }

  function renderModalContent(modal) {
    if (modal.kind === "tutorial") {
      return '<div style="padding: 10px; color: #dce6e2; line-height: 1.8; white-space: pre-wrap; font-size: 1.05rem;">' + escapeHtml(modal.text) + '</div>';
    }
    if (modal.candidates.length === 0) return '<div class="empty-state">这里没有牌。</div>';
    return (
      '<div class="modal-card-grid">' +
      modal.candidates.map(function (card) {
        const selected = modal.selectedIds.includes(card.id);
        const selectable = modal.kind !== "pile";
        const className = selected ? "modal-card is-selected" : "modal-card";
        const attrs = selectable ? ' type="button" data-select-card="' + card.id + '"' : ' type="button" disabled';
        const values = cardValueOptions(card).join("/");
        return (
          '<button class="' + className + '"' + attrs + ">" + renderCard(card) +
            '<small class="card-description">' + escapeHtml(values) + "点" + escapeHtml(getCardTagText(card)) + "</small>" +
          "</button>"
        );
      }).join("") + "</div>"
    );
  }

  function renderModalActions(modal) {
    if (modal.kind === "tutorial") {
      return (modal.actions || []).map(function (action) {
        const className = action.primary ? "game-button primary" : "game-button";
        return '<button class="' + className + '" type="button" data-tutorial-action="' + escapeHtml(action.action) + '">' + escapeHtml(action.label) + "</button>";
      }).join("");
    }
    if (modal.kind === "pile") return '<button class="game-button primary" type="button" data-modal-close>关闭</button>';
    const valid = isModalSelectionValid(modal);
    const confirmText = modal.kind === "brush" ? "确认使用" : "弃掉这张";
    return '<button class="game-button" type="button" data-modal-cancel>取消</button>' +
           '<button class="game-button primary" type="button" data-modal-confirm' + (valid ? "" : " disabled") + ">" + confirmText + "</button>";
  }

  function renderGameOver() {
    if (state.phase !== "gameover") { elements.gameOverDialog.hidden = true; return; }
    elements.gameOverDialog.hidden = false;
    elements.gameOverSummary.textContent = "你抵达第" + state.floor + "层，最佳纪录为第" + state.best + "层。";
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  document.addEventListener("click", function (event) {
    if (state.tutorial.active && state.tutorial.locked) return;

    const actionButton = event.target.closest("[data-action]");
    const pileButton = event.target.closest("[data-view-pile]");
    const buyRuneButton = event.target.closest("[data-buy-rune]");
    const buyBrushButton = event.target.closest("[data-buy-brush]");
    const sellRuneButton = event.target.closest("[data-sell-rune]");
    const selectCardButton = event.target.closest("[data-select-card]");
    const modalConfirm = event.target.closest("[data-modal-confirm]");
    const modalCancel = event.target.closest("[data-modal-cancel]");
    const modalClose = event.target.closest("[data-modal-close]");

    const tutorialActionBtn = event.target.closest("[data-tutorial-action]");
    if (tutorialActionBtn) {
      handleTutorialAction(tutorialActionBtn.dataset.tutorialAction);
      return;
    }

    if (state.tutorial.active) {
      if (state.tutorial.awaiting === "boss-hover") {
        return;
      }
      if (state.tutorial.awaiting === "discard-select") {
        if (!selectCardButton && !modalConfirm) return;
      } else if (state.tutorial.awaiting === "discard-button") {
        if (!actionButton || actionButton.dataset.action !== "discard") return;
      } else if (state.tutorial.awaiting === "hit") {
        if (!actionButton || actionButton.dataset.action !== "hit") return;
      } else if (state.tutorial.awaiting === "stand") {
        if (!actionButton || actionButton.dataset.action !== "stand") return;
      } else if (state.tutorial.awaiting === "shop-buy") {
        if (!buyRuneButton && !buyBrushButton) return;
      }
    }

    if (pileButton) { openPileViewer(pileButton.dataset.viewPile); return; }
    if (buyRuneButton) { buyRune(buyRuneButton.dataset.buyRune); return; }
    if (buyBrushButton) { startBrushPurchase(buyBrushButton.dataset.buyBrush); return; }
    if (sellRuneButton) { sellRune(sellRuneButton.dataset.sellRune); return; }
    if (selectCardButton) { toggleModalCard(selectCardButton.dataset.selectCard); return; }
    if (modalConfirm) {
      if (state.modal && state.modal.kind === "brush") confirmBrush();
      else executeDiscard();
      return;
    }
    if (modalCancel) { cancelModal(); return; }
    if (modalClose) { cancelModal(); return; }
    if (!actionButton) return;

    if (actionButton.dataset.action === "hit") hit();
    else if (actionButton.dataset.action === "discard") startDiscard();
    else if (actionButton.dataset.action === "stand") stand();
    else if (actionButton.dataset.action === "next") nextRound();
    else if (actionButton.dataset.action === "restart") resetGame("restart");
    else if (actionButton.dataset.action === "refresh") refreshShop();
  });

  document.addEventListener("mouseover", function (event) {
    const bossNode = event.target.closest('[data-tutorial-id="boss-node"]');
    if (!bossNode) return;
    if (state.tutorial.active && state.tutorial.awaiting === "boss-hover" && !state.tutorial.locked) {
      state.tutorial.awaiting = "";
      delayTutorialPrompt("finish");
      render();
    }
  });

  ['runeSlots', 'rewardPreview', 'runeHint'].forEach(function(id) {
    const el = elements[id];
    if (el) {
      const parent = el.closest('.stat-chip, .deck-grid > div');
      if (parent) parent.style.display = 'none'; 
    }
  });

  if (elements.suitStat) {
    const parent = elements.suitStat.closest('.stat-chip, .deck-grid > div');
    if (parent) {
      parent.style.gridColumn = '1 / -1'; 
      parent.style.padding = '12px 18px'; 
      parent.style.background = 'rgba(12, 18, 20, 0.8)'; 
    }
  }

  resetGame("boot");
})();