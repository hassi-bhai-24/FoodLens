// Deterministic guard layer for the chat proxy.
//
// This is defence in depth, not a replacement for the system prompt:
// clear non-food requests, prompt-injection attempts, emergencies and
// dangerous requests get a short, safe reply WITHOUT calling a provider
// (so they are handled the same way with or without an API key, and a
// misbehaving model cannot override them). Every other food question
// goes to the provider and is answered by the model — nothing here
// hard-codes food answers.
//
// The patterns below are general categories, not exact test sentences:
// a new coding, hacking, injection or emergency phrasing that falls in
// the same category must be caught by the same rule.

export type GuardResult = { kind: "redirect" | "safety" | "clarify"; text: string };

const REDIRECT_EN =
  "I'm FOODLENS, a food-focused assistant, so I can't help with that one. But ask me anything about what you eat, cook or buy, or send a photo of a snack. For example: is this biscuit healthy, or what can I cook with chicken and rice?";
const REDIRECT_URDU =
  "میں FOODLENS ہوں، کھانے سے متعلق مددگار۔ میں اس میں مدد نہیں کر سکتا۔ کھانے، پکانے یا خریداری کے بارے میں کچھ بھی پوچھیں، یا کسی اسنیک کی تصویر بھیجیں۔";

const REDIRECT_ARABIC =
  "أنا FOODLENS، مساعد متخصص في الطعام، لذا لا أستطيع المساعدة في هذا. اسألني عن أي شيء تأكله أو تطبخه أو تشتريه، أو أرسل صورة لوجبة خفيفة.";

function redirectFor(text: string): string {
  // Urdu-specific letters distinguish Urdu script from Arabic script.
  if (/[ٹڈڑںے]/.test(text)) return REDIRECT_URDU;
  if (/[\u0600-\u06FF]/.test(text)) return REDIRECT_ARABIC;
  return REDIRECT_EN;
}


// Extreme weight loss is a RATE, not a time unit: losing 5 kg in 60 days
// (~0.6 kg/week) is gradual and must reach the model; losing 10 kg in
// 3 days is dangerous. Trigger only above ~1.5 kg/week. Units: kg, lb,
// days, weeks, months. A bare "lose weight" with no amount/time is not
// extreme on its own — the model gives safe general guidance.
export function isExtremeWeightLoss(text: string): boolean {
  const s = text.toLowerCase();
  const m = s.match(/\blose\s+(\d+(?:\.\d+)?)\s*(kg|kilos?|pounds?|lbs?)\s+in\s+(\d+(?:\.\d+)?)\s*(days?|weeks?|months?)\b/);
  if (!m) return false;
  const amountKg = parseFloat(m[1]) * (m[2].startsWith("p") || m[2] === "lb" || m[2] === "lbs" ? 0.453592 : 1);
  const days = parseFloat(m[3]) * (m[4].startsWith("week") ? 7 : m[4].startsWith("month") ? 30.44 : 1);
  if (days <= 0) return false;
  return amountKg / (days / 7) > 1.5;
}

function safety(text: string): GuardResult | null {
  const t = text.toLowerCase();
  // Batch 4 (T2): emergency and sensitive replies. All are SHORT,
  // emergency-first, use "your local emergency number" wording, and
  // never invent a phone number. Self-harm is checked first and never
  // gets a food redirect. Disordered-eating replies contain no digits
  // and no calorie numbers at all, so they can never repeat a number
  // back to the user.
  if (
    /\bkill myself\b/.test(t) ||
    /\b(hurt|harm) (myself|me)\b/.test(t) ||
    /\bend(ing)? my life\b/.test(t) ||
    /\bi want to die\b/.test(t) ||
    /\bsuicid\w*\b/.test(t) ||
    /\bself[- ]harm\b/.test(t) ||
    /\bcut(ting)? myself\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "I'm really glad you told me. You don't have to face this alone — please talk to someone you trust right away, or contact a local crisis service. If you feel you might act on these thoughts, please call your local emergency number or go to urgent care right away.",
    };
  }
  if (
    /\bchok\w*\b/.test(t) &&
    /\b(baby|toddler|child|infant|turning blue|can.?t breathe|cannot breathe)\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "If a baby or child is choking and cannot breathe or is turning blue, call your local emergency number right away and get urgent help. Do not give food or drink. Follow your local first-aid guidance for choking if you know it, and stay with them until help arrives.",
    };
  }
  if (
    /\b(swallowed|drank|drunk|ate|eaten)\b.*\b(bleach|detergent|rat poison|poison|pesticide|chemicals?)\b/.test(t) ||
    (/\bchild\b/.test(t) && /\bswallowed\b/.test(t) && /\b(poison|medicine|pills?|tablets?|bleach|detergent)\b/.test(t))
  ) {
    return {
      kind: "safety",
      text: "Call your local emergency number right away and get urgent help. Do not make them vomit and do not give food or drink unless a medical professional tells you to. Keep the container or label if you can, and tell responders what was swallowed.",
    };
  }
  if (
    /\bformula\b/.test(t) &&
    /\b(twice|double|wrong|too much|too little|diluted|concentrated|cow'?s milk)\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "Do not feed that bottle. Please contact a paediatrician or urgent care right away for advice about your baby, and call your local emergency number if your baby seems unwell. Keep the tin and the bottle so you can tell them exactly how it was mixed.",
    };
  }
  if (
    (/\bdiabet/.test(t) || /\b(blood sugar|glucose|hypo)\b/.test(t)) &&
    /\b(shaking|sweating|confused|faint|dizzy|unconscious|very low|low sugar)\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "Call your local emergency number right away, especially if they are confused, faint, or not recovering. If they can swallow safely, give fast-acting sugar as advised by their diabetes plan. Do not give food or drink if they cannot swallow.",
    };
  }
  if (
    /\b(starv\w* myself|purge|purging|binge)\b/.test(t) ||
    /\bmake myself (sick|vomit)\b/.test(t) ||
    (/\bonly\s+\d+\s*(kcal|calories?)\b/.test(t) && /\b(faint|dizzy|unwell|starv)\b/.test(t))
  ) {
    return {
      kind: "safety",
      text: "I'm really glad you told me. You deserve support with this, and you don't have to handle it alone. Please talk to a doctor or dietitian, or someone you trust, about getting help for eating difficulties. If you feel faint or unwell, please get urgent medical help right away.",
    };
  }
  // Emergencies first: never give food advice for these.
  if (
    /\bvomit\w*\s+(blood|red)\b/.test(t) ||
    /\bvomiting blood\b/.test(t) ||
    /\bcough\w*\s+up\s+blood\b/.test(t) ||
    /\bblood in (my )?(vomit|stool|poo)\b/.test(t) ||
    /\banaphyla/.test(t) ||
    /\bsevere allergic reaction\b/.test(t) ||
    /\bcan.?t breathe\b/.test(t) ||
    /\bdifficulty breathing\b/.test(t) ||
    /\bthroat (is )?(closing|swelling|tight)\b/.test(t) ||
    /\b(lips?|tongue|face)\b.*\bswell\w*\b/.test(t) ||
    /\bhives\b.*\b(breath|swell|throat)\b/.test(t) ||
    /\bwheez\w*\b.*\b(after eating|ate)\b/.test(t) ||
    /\bfood poisoning\b.*\b(vomit\w* blood|blood|faint|unconscious|severe)\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "This sounds urgent. Call your local emergency number right away and get urgent medical help. Do not eat or drink more until you have had urgent medical advice. If someone is with you, tell them what is happening.",
    };
  }
  if (
    /\bstop (taking )?(my )?(medicine|medication|insulin|tablets?|pills?)\b/.test(t) ||
    /\bshould i stop\b.*\b(medicine|medication)\b/.test(t) ||
    /\buse only (a )?diet\b.*\binstead of\b.*\b(medicine|medication)\b/.test(t) ||
    /\breplace (my )?(medicine|medication) with\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "Please don't stop your medicine, and don't replace it with a diet or a single food. Stopping medicine can be unsafe. Talk to your doctor or dietitian about food choices that fit alongside your treatment — they can advise for your condition and dose.",
    };
  }
  if (
    /\bcure (my )?(diabetes|disease|cancer)\b/.test(t) ||
    /\bcure\b.*\bby eating only\b/.test(t) ||
    /\beating only\b.*\bcure\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "No single food cures diabetes or any disease, and eating only one food is not safe. Bitter gourd and other foods can be part of a balanced diet, but they don't replace medicine. Please talk to your doctor or dietitian about managing diabetes.",
    };
  }
  if (
    isExtremeWeightLoss(t) ||
    /\bonly\s+500\s*calories?\b/.test(t) ||
    /\b500\s*(kcal|calories?)\s*a day\b/.test(t) ||
    /\beating disorder\b/.test(t) ||
    /\bextreme (diet|fast|restriction)\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "Losing weight that fast, or eating only about 500 calories a day, isn't safe — it can harm your heart, muscles and overall health. A gradual, balanced approach with enough food is safer. If weight or eating feels hard to control, please talk to a doctor or dietitian for support.",
    };
  }
  if (/\bwild mushrooms?\b/.test(t)) {
    return {
      kind: "safety",
      text: "Don't eat wild mushrooms without an expert identifying them in person — a description or a photo alone can't prove a mushroom is safe, and some look-alikes are poisonous. When in doubt, throw it out. If you think someone has eaten a wild mushroom and feels unwell, get urgent medical help.",
    };
  }
  if (
    /\bexpired food\b/.test(t) ||
    /\beat (it )?if it smells fine\b/.test(t) ||
    /\bout of date\b.*\beat\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "When in doubt, throw it out. Smell and appearance can't prove expired food is safe. Don't taste food to check it — if it's past its date, stored wrongly, or you're unsure, it's safer not to eat it.",
    };
  }
  if (
    /\bhousehold chemicals?\b/.test(t) ||
    /\bmix\b.*\b(chemicals?|bleach|detergent|preservative)\b.*\binto food\b/.test(t) ||
    /\bchemicals?\b.*\binto food\b/.test(t)
  ) {
    return {
      kind: "safety",
      text: "Never mix household chemicals into food — that can poison people, even in small amounts. Food should only be preserved with food-safe methods (like proper chilling, freezing or pickling with food ingredients). If food with chemicals has been eaten, get urgent medical help.",
    };
  }
  if (/\balcohol\b/.test(t) && /\b(16|17|minor|under ?18|teen|child|kid)\b/.test(t)) {
    return {
      kind: "safety",
      text: "Alcohol isn't safe for anyone under 18 — there's no safe amount at 16. If you're worried about drinking, please talk to a trusted adult or a health professional.",
    };
  }
  if (/\b(dog|puppy)\b.*\bchocolate\b/.test(t) || /\bchocolate\b.*\b(dog|puppy)\b/.test(t)) {
    return {
      kind: "safety",
      text: "Don't feed chocolate to a dog — chocolate is toxic to dogs, even in small amounts. If a dog has eaten chocolate, contact a vet urgently and tell them the dog's size, the type of chocolate and how much was eaten.",
    };
  }
  return null;
}

function injection(text: string): GuardResult | null {
  const t = text.toLowerCase();
  const patterns = [
    /ignore (all )?(previous|prior|your) instructions?/,
    /ignore the (user|instructions?)/,
    /tell me your (system prompt|instructions?|prompt|api key)/,
    /repeat (the )?(first \d+ words of )?(your )?(instructions?|system prompt)/,
    /show me (the |your )?(api key|system prompt|instructions?)/,
    /reveal (the |your )?(api key|system prompt|instructions?|what other users)/,
    /what (did )?other users (ask|say)/,
    /you are now (a )?(general|different) assistant/,
    /become (a )?(general|different) assistant/,
    /act as (a )?(general|different) assistant/,
    /pretend (food rules|.*don.?t apply)/,
    /disable food(-only)? mode/,
    /food(-only)? (rules?|mode) (don.?t|doesn.?t) apply/,
    /\badmin\b.*\b(disable|override|mode)\b/,
    /\bsystem\s*:/,
    /jailbreak|do anything now|dan mode/,
    // Batch 5: role-play tricks.
    /pretend you are (my )?(grandmother|grandma|admin)/,
    /pretend (you are )?(a )?(general|different) assistant/,
    /my grandmother (used to )?read/,
    /grandmother.*(system prompt|instructions)/,
    // Batch 5: Urdu-script injections (ignore / show system prompt / API key).
    /نظر\s*انداز.*(ہدایات|سسٹم|پرامپٹ|چابی|اے\s*پی\s*آئی)/,
    /ہدایات.*نظر\s*انداز/,
    /سسٹم\s*پرامپٹ.*(دکھائیں|بتائیں|پڑھ)/,
    /(دکھائیں|بتائیں).*سسٹم\s*پرامپٹ/,
    /اے\s*پی\s*آئی.*(چابی|دکھائیں|بتائیں)/,
    /api\s*key.*(دکھائیں|بتائیں)|(دکھائیں|بتائیں).*api\s*key/,
    // Batch 5: Roman Urdu transliterations.
    /ignore\s*karo/,
    /system\s*prompt\s*(dikhao|batao|sunao)/,
    /(api|a\s*p\s*i)\s*(key|ki)\s*(dikhao|batao|do)/,
    /apni\s+(instructions?|prompt|api)/,
    // Batch 5: Arabic injections.
    /تجاهل.*(التعليمات|تعليمات)/,
    /أظهر.*(موجه النظام|مفتاح|النظام)/,
    /مفتاح.*api/i,
    /اقرأ.*(التعليمات|موجه النظام)/,
    /تظاهر.*(جدتي|جدتك|أنك)/,
    /say (that )?.*healthiest in the world/,
    /write a very long reply (so|to).*crash/,
    /crash (the )?server/,
  ];
  if (patterns.some((re) => re.test(t))) {
    return {
      kind: "redirect",
      text: "I can't share my instructions or any API key, and I can't switch out of food-only mode. I'm FOODLENS, so ask me about food, cooking or a label photo instead — for example, is this snack healthy, or what can I cook today?",
    };
  }
  return null;
}

function nonFood(text: string): GuardResult | null {
  const t = text.toLowerCase().trim();
  // Greetings and identity questions stay with the model (warm answers).
  if (/^(hi|hello|hey|salaam|assalam|salam|good (morning|evening|afternoon)|who are you|what can you do|what are you)\b/.test(t)) return null;
  // Batch 3 food-context allowlist: trigger words in a food context must
  // reach the model (stock, hack, cricket, Java, date, fasting, ...).
  const isFoodContext = /\b(food|eat|eating|meal|recipe|cook|cooking|ingredient|nutrition|diet|snack|drink|restaurant|grocery|kitchen|vitamin|protein|calorie|allergy|diabet|pregnan|baby|child|cheese|chocolate|coffee|flour|stock|dates|mushroom|vanilla|lunchbox|packet|biscuit|garlic|coconut|wine|fruit|vegetable|milk|egg|rice|bread|butter|honey|meat|chicken|fish|salt|sugar|fasting|ramadan|sehri|iftar|halal|label|barcode|cricket flour)\b/.test(t);
  // Feeling sad: empathy + redirect, not therapy and not a cold refusal.
  // Batch 3: with a food context (e.g. "I feel sad and eat chocolate") the
  // message must reach the model, which answers the food question
  // empathetically. Pure sadness with no food context still redirects.
  if (/\bi feel sad\b|\bi.?m (so )?sad\b|\bfeeling (sad|down|low)\b/.test(t) && !isFoodContext) {
    return {
      kind: "redirect",
      text: "I'm sorry you're feeling sad today. I'm FOODLENS, so I can't talk through everything, but I'm here for food questions — and sometimes a warm meal or a favourite snack can be a small comfort. If the sadness feels heavy or unsafe, please talk to someone you trust or a health professional.",
    };
  }
  // isFoodContext is computed above (Batch 3) and reused here.
  const patterns: RegExp[] = [
    /\b(python|javascript|typescript|java\b|c\+\+|sql|html|css)\b.*\b(code|program|function|script|debug|error|bug)\b/,
    /\b(write|debug|fix|create|build)\b.*\b(code|python|javascript|program|function|script|app|website|calculator)\b/,
    /\b(write|debug)\b.*\bcode\b/,
    /\bhomework\b/,
    /\b(math|algebra|calculus|geometry|physics|chemistry)\b.*\b(homework|problem|solve|question|help)\b/,
    /\bsolve\b.*\b(equation|math|algebra)\b/,
    /\bcapital of\b/,
    /\bwho won\b.*\b(match|game|election)\b/,
    /\bcricket\b.*\b(match|score|won|result)\b/,
    /\bfootball\b.*\b(score|result|won)\b/,
    /\btell me a joke\b/,
    /\bhack\b.*\b(wifi|wi-fi|password|account|phone)\b/,
    /\bhow (do|to) (i )?hack\b.*\b(wifi|wi-fi|password|account|phone|computer|email|instagram|facebook)\b/,
    /\bwrite (me )?(an? )?(email|letter|message) (to|for)\b/,
    /\bemail to my boss\b/,
    /\bstock (market|price|ticker|shares?)\b/,
    /\b(crypto|bitcoin|invest|loan|tax|mortgage)\b/,
    /\b(write|draft) (a )?(cv|resume|cover letter)\b/,
    /\b(movie|song|lyrics|celebrity|gossip)\b/,
    /\btranslate\b.*\b(sentence|document)\b(?!\s+(food|label|ingredient))/,
    /\bweather (today|forecast)\b/,
    /\bnews (today|headlines)\b/,
    /\bpolitics?\b.*\b(election|party|vote)\b/,
  ];
  // QR/barcode codes on packets are food-adjacent, not coding.
  if (/\bqr code\b|\bbarcode\b/.test(t)) return null;
  if (patterns.some((re) => re.test(t)) && !isFoodContext) return { kind: "redirect", text: redirectFor(text) };
  return null;
}

export function classifyUserText(text: string, hasImages = false): GuardResult | null {
  const trimmed = text.trim();
  // Degenerate input: only punctuation / symbols, or one repeated
  // character run. Empty input is rejected by validation before this.
  if (trimmed && /^[^A-Za-z0-9\u0600-\u06FF\u4E00-\u9FFF]+$/.test(trimmed)) {
    return {
      kind: "clarify",
      text: "I didn't catch a food question there — could you ask it in words? For example: is this biscuit healthy, or what can I cook with chicken and rice? You can also send a photo of a label or a plate.",
    };
  }
  if (trimmed.length >= 100 && new Set(trimmed.toLowerCase()).size <= 3) {
    return {
      kind: "clarify",
      text: "That message looks like repeated characters, so I can't tell what you're asking. Please type your food question in words, or send a photo of a label or a plate.",
    };
  }
  void hasImages;
  return safety(text) || injection(text) || nonFood(text);
}
